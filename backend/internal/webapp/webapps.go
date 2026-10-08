package webapp

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// ListWebApps lists a project's web apps. It reads the project's
// components, environments and the namespace's release bindings once each,
// concurrently, and joins them in memory: O(1) upstream calls per request.
func (s *Service) ListWebApps(ctx context.Context, projectID string) ([]WebApp, error) {
	n := ns(ctx)
	var (
		comps    []gen.Component
		envs     []Environment
		bindings []gen.ReleaseBinding
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { comps, err = s.oc.ListComponents(gctx, n, projectID, webAppSelector); return })
	g.Go(func() (err error) { envs, err = s.pipelineEnvironments(gctx, projectID); return })
	g.Go(func() (err error) { bindings, err = s.oc.ListReleaseBindings(gctx, n, ""); return })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	idx := indexBindings(bindings)
	byApp := map[string][]track{}
	for _, c := range comps {
		if deleting(c) {
			continue
		}
		t := trackOf(c)
		byApp[t.WebApp] = append(byApp[t.WebApp], t)
	}
	out := make([]WebApp, 0, len(byApp))
	for _, tracks := range byApp {
		out = append(out, s.toWebApp(tracks, envs, idx, nil))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

// GetWebApp returns one web app.
func (s *Service) GetWebApp(ctx context.Context, projectID, webAppID string) (*WebApp, error) {
	tracks, err := s.webAppTracks(ctx, webAppID)
	if err != nil {
		return nil, err
	}
	if projectID != "" && tracks[0].Project != projectID {
		return nil, errf(CodeNotFound, "web app %q not found in project %q", webAppID, projectID)
	}
	def := defaultTrack(tracks)
	n := ns(ctx)
	var (
		envs     []Environment
		bindings []gen.ReleaseBinding
		runs     []gen.WorkflowRun
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { envs, err = s.pipelineEnvironments(gctx, def.Project); return })
	g.Go(func() (err error) { bindings, err = s.oc.ListReleaseBindings(gctx, n, def.Name); return })
	g.Go(func() error {
		// The latest commit is decoration: a failure here doesn't fail the page.
		runs, _ = s.listRuns(gctx, def.Name)
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, err
	}
	var latest *gen.WorkflowRun
	if len(runs) > 0 {
		latest = &runs[0]
	}
	w := s.toWebApp(tracks, envs, indexBindings(bindings), latest)
	return &w, nil
}

func defaultTrack(tracks []track) track {
	def := tracks[0]
	for _, t := range tracks {
		if t.IsDefault {
			def = t
		}
	}
	return def
}

// toWebApp builds the web app view from its tracks, the pipeline, the
// bindings index and (optionally) the default track's latest run. No I/O.
func (s *Service) toWebApp(tracks []track, envs []Environment, bindings bindingIndex, latest *gen.WorkflowRun) WebApp {
	def := defaultTrack(tracks)
	w := WebApp{
		ID: def.WebApp, Handler: def.WebApp, ProjectID: def.Project, DefaultTrack: def.Name,
		DisplayName: annotation(def.comp.Metadata, AnnDisplayName), Description: annotation(def.comp.Metadata, AnnDescription),
		Framework: def.Preset.Label(), BuildPreset: string(def.Preset), SourceType: def.SourceType, RepoURL: def.RepoURL,
		UpdatedAt: ts(def.comp.Metadata.CreationTimestamp), Status: "not-deployed",
	}
	if w.DisplayName == "" {
		w.DisplayName = def.WebApp
	}
	if len(envs) > 0 {
		if b, ok := bindings[def.Name][envs[0].ID]; ok && bindingActive(b) {
			w.Status = webAppStatus(deploymentStatus(b))
			w.URL = s.bindingURL(b)
		}
	}
	if latest != nil {
		if sha := annotation(latest.Metadata, AnnCommitSHA); sha != "" {
			w.LatestCommit = &Commit{SHA: sha, Message: annotation(latest.Metadata, AnnCommitMessage), Author: annotation(latest.Metadata, AnnCommitAuthor), CommittedAt: annotation(latest.Metadata, AnnCommitDate)}
		}
	}
	return w
}

func webAppStatus(deployment string) string {
	switch deployment {
	case "active":
		return "active"
	case "deploying":
		return "deploying"
	case "failed":
		return "failed"
	default:
		return "not-deployed"
	}
}

// CreateWebApp creates a web app = its default track Component (D3): ensure
// our CT + SPA workflow (D9), create the Component, bind the git source and
// start the first build. PAS answers 402 when the org is over quota (D7).
func (s *Service) CreateWebApp(ctx context.Context, projectID string, in CreateWebAppInput) (*WebApp, error) {
	if in.SourceType != "github" && in.SourceType != "public-git" {
		return nil, errf(CodeNotSupported, "source type %q is not supported yet", in.SourceType)
	}
	if !ValidHandle(in.Handler) {
		return nil, errf(CodeBadRequest, "invalid web app name %q: use lowercase letters, numbers and hyphens (max %d)", in.Handler, maxHandle)
	}
	preset := Preset(in.BuildPreset)
	if !preset.Valid() {
		return nil, errf(CodeBadRequest, "unknown build preset %q", in.BuildPreset)
	}
	if in.SourceType == "github" && !s.p.Git.GitHubAppEnabled() {
		return nil, errf(CodeNotSupported, "GitHub App repositories are not available on this platform; use a public repository URL")
	}
	repoURL, err := repoURLOf(in)
	if err != nil {
		return nil, err
	}
	branch := strings.TrimSpace(in.Branch)
	if branch == "" {
		branch = "main"
	}
	port := RuntimePort(preset, in.Port)
	wf, err := WorkflowFor(BuildSpec{
		Preset: preset, RepoURL: repoURL, Branch: branch, AppPath: in.ComponentDirectory,
		BuildCommand: in.BuildCommand, OutputDir: in.BuildPath, NodeVersion: in.NodeVersion, Port: port,
		DockerfilePath: dockerField(in.Docker, true), DockerContext: dockerField(in.Docker, false),
	})
	if err != nil {
		return nil, errf(CodeBadRequest, "%s", err.Error())
	}
	// Independent pre-checks run concurrently: the project exists, the name
	// is free, and our platform resources are in place (cached per process).
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error { _, err := s.getProject(gctx, projectID); return err })
	g.Go(func() error {
		existing, err := s.oc.ListComponents(gctx, ns(gctx), "", LabelWebApp+"="+in.Handler)
		if err != nil {
			return err
		}
		if len(existing) > 0 {
			return errf(CodeConflict, "a web app named %q already exists", in.Handler)
		}
		return nil
	})
	g.Go(func() error { return s.EnsurePlatformResources(gctx) })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	comp, err := s.createTrackComponent(ctx, projectID, trackSpec{
		WebApp: in.Handler, Branch: branch, IsDefault: true, Preset: preset, Port: port,
		RepoURL: repoURL, SourceType: in.SourceType, InstallationID: in.InstallationID,
		DisplayName: strings.TrimSpace(in.DisplayName), Description: strings.TrimSpace(in.Description),
		AutoDeploy: true, Params: wf.Parameters, WorkflowKind: wf.Kind, WorkflowName: wf.Name,
	})
	if err != nil {
		return nil, err
	}
	t := trackOf(*comp)
	if err := s.p.Git.BindSource(ctx, t.repoRef(), projectID, t.Name); err != nil {
		return nil, fmt.Errorf("web app created but binding the git source failed: %w", err)
	}
	s.firstBuild(ctx, in.Handler, t.Name)
	w := s.toWebApp([]track{t}, nil, nil, nil)
	return &w, nil
}

func dockerField(d *DockerBuild, file bool) string {
	if d == nil {
		return ""
	}
	if file {
		return d.FilePath
	}
	return d.Context
}

func repoURLOf(in CreateWebAppInput) (string, error) {
	repo := strings.TrimSpace(in.Repository)
	if repo == "" {
		return "", errf(CodeBadRequest, "repository is required")
	}
	var url string
	switch {
	case strings.HasPrefix(repo, "http://") || strings.HasPrefix(repo, "https://"):
		url = strings.TrimSuffix(strings.TrimSuffix(repo, "/"), ".git")
	case in.GitOrganization != "":
		url = "https://github.com/" + strings.TrimSpace(in.GitOrganization) + "/" + repo
	default:
		url = "https://github.com/" + repo
	}
	if _, _, ok := platform.ParseGitHubURL(url); !ok {
		return "", errf(CodeNotSupported, "only GitHub repositories are supported in this release (got %q)", url)
	}
	return url, nil
}
