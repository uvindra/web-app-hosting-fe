package webapp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"

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
	autoDeployPending    = "pending"
	autoDeployDone       = "done"
	autoDeployFailed     = "failed"
	autoDeploySuperseded = "superseded" // a newer build of the track was auto-deployed instead
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

// ListBuilds lists a track's builds, newest first. It also finishes the
// track's pending auto-deploys whose watcher did not (e.g. the BFF restarted).
func (s *Service) ListBuilds(ctx context.Context, webAppID, trackID string) ([]BuildRun, error) {
	var (
		t    *track
		runs []gen.WorkflowRun
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { t, err = s.getTrack(gctx, webAppID, trackID); return })
	g.Go(func() (err error) { runs, err = s.listRuns(gctx, trackID); return })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	out := make([]BuildRun, 0, len(runs))
	settle := false
	for _, r := range runs {
		b := toBuildRun(r, t.Branch)
		out = append(out, b)
		settle = settle || (annotation(r.Metadata, AnnAutoDeployState) == autoDeployPending && b.Status != BuildInProgress)
	}
	if settle {
		s.requestAutoDeploy(auth.Detached(ctx), *t)
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
	if len(b.Steps) > 0 && s.liveStepLogs(ctx, buildID, b.Steps) {
		return &b, nil
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

// stepLogConcurrency bounds the concurrent live step-log reads of one build.
const stepLogConcurrency = 4

// errNoLiveLogs stops the live step-log reads: a finished step without logs
// means the run's pods are gone and the logs are archived.
var errNoLiveLogs = errors.New("no live logs")

// liveStepLogs fills steps' logs from OpenChoreo's live run logs, reading
// the started steps concurrently (bounded) into their own slots, so step
// order is kept. It reports false when any read fails or a finished step has
// none (the caller then reads the archive).
func (s *Service) liveStepLogs(ctx context.Context, runName string, steps []BuildStep) bool {
	logs := make([][]string, len(steps))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(stepLogConcurrency)
	for i := range steps {
		if steps[i].Status == "pending" {
			continue
		}
		g.Go(func() error {
			entries, err := s.oc.GetWorkflowRunLogs(gctx, ns(gctx), runName, steps[i].Name)
			if err != nil {
				return err
			}
			if len(entries) == 0 && steps[i].Status != BuildInProgress {
				return errNoLiveLogs
			}
			lines := make([]string, 0, len(entries))
			for _, e := range entries {
				lines = append(lines, strings.TrimRight(e.Log, "\n"))
			}
			logs[i] = lines
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return false
	}
	for i := range steps {
		if logs[i] != nil {
			steps[i].Logs = logs[i]
		}
	}
	return true
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
	if t.isImage() {
		return nil, errf(CodeNotSupported, "this web app runs a container image; it has no source builds")
	}
	p := t.params()
	cfg := &BuildConfig{RepoURL: t.RepoURL, Branch: t.Branch, BuildPreset: string(t.Preset), Port: t.Port, ComponentDirectory: "/"}
	if t.AppPath != "" && t.AppPath != "." {
		cfg.ComponentDirectory = "/" + t.AppPath
	}
	if spa, ok := p["spa"].(map[string]any); ok {
		cfg.BuildCommand, _ = spa["buildCommand"].(string)
		cfg.BuildPath, _ = spa["outputDir"].(string)
		if t.Preset != PresetStatic { // static sites aren't built: no Node
			cfg.NodeVersion, _ = spa["nodeVersion"].(string)
		}
	}
	if d, ok := p["docker"].(map[string]any); ok {
		// The workflow holds repository-root paths; report them relative to
		// the component directory, the way CreateWebAppInput.docker takes them.
		app := NormalizeAppPath(t.AppPath)
		cfg.Docker = &DockerBuild{}
		if f, _ := d["filePath"].(string); f != "" {
			cfg.Docker.FilePath = relToAppPath(app, f)
		}
		if c, _ := d["context"].(string); c != "" {
			cfg.Docker.Context = relToAppPath(app, c)
		}
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
	if t.isImage() {
		return nil, errf(CodeNotSupported, "this web app runs a container image; it has no source builds")
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
	if t.isImage() {
		return nil, errf(CodeNotSupported, "this web app runs a container image; it has no source builds")
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

// watchRun polls a run until it finishes and then settles the track's
// auto-deploys (B7: OC autoDeploy is not used, see MEMORY).
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
				s.requestAutoDeploy(ctx, t)
				return
			}
		}
		slog.Warn("auto-deploy watcher timed out", "run", runName)
	}()
}

// requestAutoDeploy settles a track's finished, pending auto-deploys in the
// background. Requests for the same track are coalesced: while one pass runs,
// further requests (watchers, concurrent ListBuilds) only schedule one more
// pass, so a track never has two auto-deploy passes in flight.
func (s *Service) requestAutoDeploy(ctx context.Context, t track) {
	key := ns(ctx) + "/" + t.Name
	s.autoMu.Lock()
	if _, running := s.autoRuns[key]; running {
		s.autoRuns[key] = true // run again when the current pass ends
		s.autoMu.Unlock()
		return
	}
	s.autoRuns[key] = false
	s.autoMu.Unlock()
	s.async.Add(1)
	go func() {
		defer s.async.Done()
		for {
			s.settleAutoDeploys(ctx, t)
			s.autoMu.Lock()
			if s.autoRuns[key] {
				s.autoRuns[key] = false
				s.autoMu.Unlock()
				continue
			}
			delete(s.autoRuns, key)
			s.autoMu.Unlock()
			return
		}
	}()
}

// settleAutoDeploys deploys the track's newest finished, successful pending
// build to the first environment and settles every other finished pending
// build (failed → done, older successful → superseded), under the track's
// deploy lock so it cannot interleave with another deploy.
func (s *Service) settleAutoDeploys(ctx context.Context, t track) {
	unlock, err := s.lockTrack(ctx, t.Name)
	if err != nil {
		return
	}
	defer unlock()
	runs, err := s.listRuns(ctx, t.Name)
	if err != nil {
		slog.Warn("auto-deploy: could not list builds", "track", t.Name, "error", err)
		return
	}
	deploy, settle := planAutoDeploy(runs)
	for name, state := range settle {
		s.setAutoDeployState(ctx, name, state)
	}
	if deploy == "" {
		return
	}
	state := autoDeployDone
	envs, err := s.pipelineEnvironments(ctx, t.Project)
	if err == nil && len(envs) == 0 {
		err = fmt.Errorf("project %q has no environments", t.Project)
	}
	if err == nil {
		_, err = s.deployRunLocked(ctx, t, envs[0].ID, deploy)
	}
	if err != nil {
		slog.Error("auto-deploy failed", "run", deploy, "error", err)
		state = autoDeployFailed
	} else {
		slog.Info("auto-deployed build", "run", deploy, "track", t.Name)
	}
	s.setAutoDeployState(ctx, deploy, state)
}

// planAutoDeploy picks, from a track's runs (newest first), the one finished
// pending build to auto-deploy — the newest successful one, unless an even
// newer build was already auto-deployed — and the final state of every other
// finished pending build. In-progress builds are left pending.
func planAutoDeploy(runs []gen.WorkflowRun) (deploy string, settle map[string]string) {
	settle = map[string]string{}
	newerDeployed := false
	for _, r := range runs {
		state, status := annotation(r.Metadata, AnnAutoDeployState), RunStatus(r)
		switch {
		case state == autoDeployDone && status == BuildSuccess:
			newerDeployed = newerDeployed || deploy == ""
		case state != autoDeployPending || status == BuildInProgress:
		case status != BuildSuccess:
			settle[r.Metadata.Name] = autoDeployDone
		case deploy == "" && !newerDeployed:
			deploy = r.Metadata.Name
		default:
			settle[r.Metadata.Name] = autoDeploySuperseded
		}
	}
	return deploy, settle
}

func (s *Service) setAutoDeployState(ctx context.Context, runName, state string) {
	if err := s.oc.MutateWorkflowRun(ctx, ns(ctx), runName, func(w *gen.WorkflowRun) {
		setAnnotation(&w.Metadata, AnnAutoDeployState, state)
	}); err != nil {
		slog.Warn("could not record auto-deploy state", "run", runName, "error", err)
	}
}
