package webapp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// Build statuses (frontend BuildRunStatus).
const (
	BuildSuccess    = "success"
	BuildFailed     = "failed"
	BuildInProgress = "in-progress"
)

// auto-deploy states on a WorkflowRun.
const (
	autoDeployPending = "pending"
	autoDeployDone    = "done"
	autoDeployFailed  = "failed"
)

func (s *Service) listRuns(ctx context.Context, component string) ([]gen.WorkflowRun, error) {
	runs, err := s.oc.ListWorkflowRuns(ctx, ns(ctx), LabelOCComponent+"="+component)
	if err != nil {
		return nil, err
	}
	sort.Slice(runs, func(i, j int) bool {
		a, b := runs[i].Metadata.CreationTimestamp, runs[j].Metadata.CreationTimestamp
		if a == nil || b == nil {
			return runs[i].Metadata.Name > runs[j].Metadata.Name
		}
		return a.After(*b)
	})
	return runs, nil
}

// RunStatus maps a WorkflowRun to success | failed | in-progress.
func RunStatus(r gen.WorkflowRun) string {
	if r.Status == nil || r.Status.Conditions == nil {
		return BuildInProgress
	}
	for _, c := range *r.Status.Conditions {
		if c.Type == "WorkflowCompleted" && c.Status == gen.ConditionStatus("True") {
			if strings.Contains(c.Reason, "Succeeded") {
				return BuildSuccess
			}
			return BuildFailed
		}
		if c.Type == "WorkflowFailed" && c.Status == gen.ConditionStatus("True") {
			return BuildFailed
		}
	}
	return BuildInProgress
}

func stepStatus(phase string) string {
	switch phase {
	case "Succeeded", "Skipped":
		return BuildSuccess
	case "Failed", "Error":
		return BuildFailed
	case "Running":
		return BuildInProgress
	default:
		return "pending"
	}
}

func toBuildRun(r gen.WorkflowRun, branch string) BuildRun {
	b := BuildRun{
		ID: r.Metadata.Name, Status: RunStatus(r), Branch: branch,
		CommitSHA: annotation(r.Metadata, AnnCommitSHA), CommitMessage: annotation(r.Metadata, AnnCommitMessage),
		Author: annotation(r.Metadata, AnnCommitAuthor), TriggeredAt: ts(r.Metadata.CreationTimestamp), Steps: []BuildStep{},
	}
	if r.Status != nil {
		if b.Status != BuildInProgress {
			b.CompletedAt = ts(r.Status.CompletedAt)
		}
		if r.Status.Tasks != nil {
			for _, t := range *r.Status.Tasks {
				phase := ""
				if t.Phase != nil {
					phase = *t.Phase
				}
				b.Steps = append(b.Steps, BuildStep{Name: t.Name, Status: stepStatus(phase), Logs: []string{}})
			}
		}
	}
	return b
}

// ListBuilds lists a track's builds, newest first. It also finishes any
// pending auto-deploy whose watcher did not (e.g. the BFF restarted).
func (s *Service) ListBuilds(ctx context.Context, webAppID, trackID string) ([]BuildRun, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	runs, err := s.listRuns(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	out := make([]BuildRun, 0, len(runs))
	for _, r := range runs {
		b := toBuildRun(r, t.Branch)
		out = append(out, b)
		if annotation(r.Metadata, AnnAutoDeployState) == autoDeployPending && b.Status != BuildInProgress {
			s.finishAutoDeploy(auth.Detached(ctx), *t, r.Metadata.Name)
		}
	}
	return out, nil
}

// BuildLogs returns a build's steps with their logs: live from OpenChoreo
// while the run's pods exist, else archived from the observability plane,
// attributed to steps by their time windows.
func (s *Service) BuildLogs(ctx context.Context, webAppID, trackID, buildID string) (*BuildRun, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	r, err := s.oc.GetWorkflowRun(ctx, ns(ctx), buildID)
	if err != nil {
		if notFound(err) {
			return nil, errf(CodeNotFound, "build %q not found", buildID)
		}
		return nil, err
	}
	if label(r.Metadata, LabelOCComponent) != t.Name {
		return nil, errf(CodeNotFound, "build %q not found", buildID)
	}
	b := toBuildRun(*r, t.Branch)
	live := true
	for i := range b.Steps {
		if b.Steps[i].Status == "pending" {
			continue
		}
		entries, err := s.oc.GetWorkflowRunLogs(ctx, ns(ctx), buildID, b.Steps[i].Name)
		if err != nil || (len(entries) == 0 && b.Steps[i].Status != BuildInProgress) {
			live = false
			break
		}
		for _, e := range entries {
			b.Steps[i].Logs = append(b.Steps[i].Logs, strings.TrimRight(e.Log, "\n"))
		}
	}
	if live && len(b.Steps) > 0 {
		return &b, nil
	}
	for i := range b.Steps {
		b.Steps[i].Logs = []string{}
	}
	start := time.Now().Add(-7 * 24 * time.Hour)
	if r.Metadata.CreationTimestamp != nil {
		start = r.Metadata.CreationTimestamp.Add(-time.Minute)
	}
	entries, err := s.p.Observability.QueryLogs(ctx, platform.LogQuery{
		Namespace: ns(ctx), WorkflowRunName: buildID, Start: start, End: time.Now(), Limit: 5000, SortOrder: "asc",
	})
	if err != nil {
		return nil, fmt.Errorf("archived build logs: %w", err)
	}
	assignLogsToSteps(&b, r, entries)
	return &b, nil
}

// assignLogsToSteps buckets archived log lines into steps by each task's
// [startedAt, completedAt] window (second precision, inclusive).
func assignLogsToSteps(b *BuildRun, r *gen.WorkflowRun, entries []platform.LogEntry) {
	if len(b.Steps) == 0 {
		b.Steps = []BuildStep{{Name: "build", Status: b.Status, Logs: []string{}}}
	}
	type window struct{ from, to time.Time }
	wins := make([]window, len(b.Steps))
	if r.Status != nil && r.Status.Tasks != nil {
		for i, t := range *r.Status.Tasks {
			if i >= len(wins) {
				break
			}
			if t.StartedAt != nil {
				wins[i].from = t.StartedAt.Truncate(time.Second)
			}
			if t.CompletedAt != nil {
				wins[i].to = t.CompletedAt.Add(time.Second)
			}
		}
	}
	for _, e := range entries {
		idx := len(b.Steps) - 1
		for i, w := range wins {
			if !w.from.IsZero() && !e.Timestamp.Before(w.from) && (w.to.IsZero() || e.Timestamp.Before(w.to)) {
				idx = i
				break
			}
		}
		b.Steps[idx].Logs = append(b.Steps[idx].Logs, strings.TrimRight(e.Log, "\n"))
	}
}

// BuildConfig returns the build settings (from the Component workflow parameters).
func (s *Service) BuildConfig(ctx context.Context, webAppID, trackID string) (*BuildConfig, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	p := t.params()
	cfg := &BuildConfig{RepoURL: t.RepoURL, Branch: t.Branch, BuildPreset: string(t.Preset), Port: t.Port, ComponentDirectory: "/"}
	if t.AppPath != "" && t.AppPath != "." {
		cfg.ComponentDirectory = "/" + t.AppPath
	}
	if spa, ok := p["spa"].(map[string]any); ok {
		cfg.BuildCommand, _ = spa["buildCommand"].(string)
		cfg.BuildPath, _ = spa["outputDir"].(string)
		cfg.NodeVersion, _ = spa["nodeVersion"].(string)
	}
	if env, ok := p["buildEnv"].([]any); ok {
		for _, e := range env {
			if m, ok := e.(map[string]any); ok && m["name"] == "BP_NODE_VERSION" {
				cfg.NodeVersion, _ = m["value"].(string)
			}
		}
	}
	return cfg, nil
}

// LatestCommit returns the head commit of the track's branch.
func (s *Service) LatestCommit(ctx context.Context, webAppID, trackID string) (*LatestCommit, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	c, err := s.p.Git.LatestCommit(ctx, t.repoRef(), t.Project, t.Name)
	if err != nil {
		return nil, err
	}
	return &LatestCommit{SHA: c.SHA, Message: c.Message, Author: c.Author, CommittedAt: c.CommittedAt.UTC().Format(time.RFC3339), Branch: t.Branch, RepoURL: t.RepoURL}, nil
}

// TriggerBuild starts a WorkflowRun for the track at sha (default: branch head).
func (s *Service) TriggerBuild(ctx context.Context, webAppID, trackID, sha string) (*BuildRun, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	commit := &platform.Commit{SHA: sha}
	if c, err := s.p.Git.LatestCommit(platform.WithFreshReads(ctx), t.repoRef(), t.Project, t.Name); err == nil {
		if sha == "" || c.SHA == sha {
			commit = c
		}
	} else {
		slog.WarnContext(ctx, "could not resolve the latest commit; building the branch head", "track", t.Name, "error", err)
	}
	runName := runNameFor(t.Name)
	secretRef, err := s.p.Git.PrepareBuild(ctx, t.repoRef(), t.Project, t.Name, runName)
	if err != nil {
		return nil, fmt.Errorf("prepare build credentials: %w", err)
	}
	params := deepCopy(t.params()).(map[string]any)
	repo, _ := params["repository"].(map[string]any)
	if repo == nil {
		repo = map[string]any{"url": t.RepoURL}
		params["repository"] = repo
	}
	rev, _ := repo["revision"].(map[string]any)
	if rev == nil {
		rev = map[string]any{}
		repo["revision"] = rev
	}
	rev["branch"] = t.Branch
	rev["commit"] = commit.SHA
	repo["secretRef"] = secretRef

	labels := map[string]string{LabelProduct: ProductName, LabelOCProject: t.Project, LabelOCComponent: t.Name, LabelWebApp: t.WebApp}
	ann := map[string]string{AnnCommitSHA: commit.SHA, AnnCommitMessage: commit.Message, AnnCommitAuthor: commit.Author}
	if !commit.CommittedAt.IsZero() {
		ann[AnnCommitDate] = commit.CommittedAt.UTC().Format(time.RFC3339)
	}
	if t.AutoDeploy {
		ann[AnnAutoDeployState] = autoDeployPending
	}
	kind := gen.WorkflowRunConfigKind(workflowKind(t.comp))
	run, err := s.oc.CreateWorkflowRun(ctx, ns(ctx), gen.WorkflowRun{
		Metadata: gen.ObjectMeta{Name: runName, Labels: &labels, Annotations: &ann},
		Spec:     &gen.WorkflowRunSpec{Workflow: gen.WorkflowRunConfig{Kind: &kind, Name: workflowName(t.comp), Parameters: &params}},
	})
	if err != nil {
		return nil, err
	}
	if t.AutoDeploy {
		s.watchRun(auth.Detached(ctx), *t, runName)
	}
	b := toBuildRun(*run, t.Branch)
	return &b, nil
}

// runNameFor returns a unique, sortable run name for a component.
func runNameFor(component string) string {
	var r [3]byte
	_, _ = rand.Read(r[:])
	base := component
	if len(base) > 40 {
		base = strings.TrimRight(base[:40], "-")
	}
	return fmt.Sprintf("%s-%s-%s", base, time.Now().UTC().Format("060102150405"), hex.EncodeToString(r[:]))
}

// watchRun polls a run until it finishes and then auto-deploys it to the
// pipeline's first environment (B7: OC autoDeploy is not used, see MEMORY).
func (s *Service) watchRun(ctx context.Context, t track, runName string) {
	if _, loaded := s.watches.LoadOrStore(runName, struct{}{}); loaded {
		return
	}
	go func() {
		defer s.watches.Delete(runName)
		deadline := time.Now().Add(s.opts.WatchTimeout)
		for time.Now().Before(deadline) {
			time.Sleep(s.opts.WatchInterval)
			r, err := s.oc.GetWorkflowRun(ctx, ns(ctx), runName)
			if err != nil {
				if notFound(err) {
					return
				}
				continue
			}
			if RunStatus(*r) != BuildInProgress {
				s.finishAutoDeploy(ctx, t, runName)
				return
			}
		}
		slog.Warn("auto-deploy watcher timed out", "run", runName)
	}()
}

// finishAutoDeploy deploys a finished, pending run to the first environment
// and records the outcome on the run. Idempotent and safe to call twice.
func (s *Service) finishAutoDeploy(ctx context.Context, t track, runName string) {
	key := "finish/" + runName
	if _, loaded := s.watches.LoadOrStore(key, struct{}{}); loaded {
		return
	}
	go func() {
		defer s.watches.Delete(key)
		r, err := s.oc.GetWorkflowRun(ctx, ns(ctx), runName)
		if err != nil || annotation(r.Metadata, AnnAutoDeployState) != autoDeployPending {
			return
		}
		state := autoDeployDone
		if RunStatus(*r) == BuildSuccess {
			envs, err := s.pipelineEnvironments(ctx, t.Project)
			if err == nil && len(envs) > 0 {
				_, err = s.deployRun(ctx, t, envs[0].ID, runName)
			}
			if err != nil {
				slog.Error("auto-deploy failed", "run", runName, "error", err)
				state = autoDeployFailed
			} else {
				slog.Info("auto-deployed build", "run", runName, "track", t.Name)
			}
		}
		if err := s.oc.MutateWorkflowRun(ctx, ns(ctx), runName, func(w *gen.WorkflowRun) {
			setAnnotation(&w.Metadata, AnnAutoDeployState, state)
		}); err != nil {
			slog.Warn("could not record auto-deploy state", "run", runName, "error", err)
		}
	}()
}
