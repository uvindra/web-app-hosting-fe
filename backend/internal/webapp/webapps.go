package webapp

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// ListWebApps lists a project's web apps.
func (s *Service) ListWebApps(ctx context.Context, projectID string) ([]WebApp, error) {
	comps, err := s.oc.ListComponents(ctx, ns(ctx), projectID, webAppSelector)
	if err != nil {
		return nil, err
	}
	byApp := map[string][]track{}
	for _, c := range comps {
		t := trackOf(c)
		byApp[t.WebApp] = append(byApp[t.WebApp], t)
	}
	envs, err := s.pipelineEnvironments(ctx, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]WebApp, 0, len(byApp))
	for _, tracks := range byApp {
		w, err := s.toWebApp(ctx, tracks, envs, false)
		if err != nil {
			return nil, err
		}
		out = append(out, *w)
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
	envs, err := s.pipelineEnvironments(ctx, tracks[0].Project)
	if err != nil {
		return nil, err
	}
	return s.toWebApp(ctx, tracks, envs, true)
}

func (s *Service) toWebApp(ctx context.Context, tracks []track, envs []Environment, withCommit bool) (*WebApp, error) {
	def := tracks[0]
	for _, t := range tracks {
		if t.IsDefault {
			def = t
		}
	}
	w := &WebApp{
		ID: def.WebApp, Handler: def.WebApp, ProjectID: def.Project, DefaultTrack: def.Name,
		DisplayName: annotation(def.comp.Metadata, AnnDisplayName), Description: annotation(def.comp.Metadata, AnnDescription),
		Framework: def.Preset.Label(), BuildPreset: string(def.Preset), SourceType: def.SourceType, RepoURL: def.RepoURL,
		UpdatedAt: ts(def.comp.Metadata.CreationTimestamp), Status: "not-deployed",
	}
	if w.DisplayName == "" {
		w.DisplayName = def.WebApp
	}
	if len(envs) > 0 {
		b, err := s.oc.FindBinding(ctx, ns(ctx), def.Name, envs[0].ID)
		if err != nil {
			return nil, err
		}
		if b != nil && bindingActive(*b) {
			w.Status = webAppStatus(deploymentStatus(*b))
			w.URL = s.bindingURL(*b)
		}
	}
	if withCommit {
		runs, err := s.listRuns(ctx, def.Name)
		if err == nil && len(runs) > 0 {
			r := runs[0]
			if sha := annotation(r.Metadata, AnnCommitSHA); sha != "" {
				w.LatestCommit = &Commit{SHA: sha, Message: annotation(r.Metadata, AnnCommitMessage), Author: annotation(r.Metadata, AnnCommitAuthor), CommittedAt: annotation(r.Metadata, AnnCommitDate)}
			}
		}
	}
	return w, nil
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
	if _, err := s.GetProject(ctx, projectID); err != nil {
		return nil, err
	}
	if existing, _ := s.oc.ListComponents(ctx, ns(ctx), "", LabelWebApp+"="+in.Handler); len(existing) > 0 {
		return nil, errf(CodeConflict, "a web app named %q already exists", in.Handler)
	}
	port := RuntimePort(preset, in.Port)
	wf, err := WorkflowFor(BuildSpec{
		Preset: preset, RepoURL: repoURL, Branch: branch, AppPath: in.ComponentDirectory,
		BuildCommand: in.BuildCommand, OutputDir: in.BuildPath, NodeVersion: in.NodeVersion, Port: port,
	})
	if err != nil {
		return nil, errf(CodeBadRequest, "%s", err.Error())
	}
	if err := s.EnsurePlatformResources(ctx); err != nil {
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
	if _, err := s.TriggerBuild(ctx, in.Handler, t.Name, ""); err != nil {
		slog.WarnContext(ctx, "first build failed to start", "webApp", in.Handler, "error", err)
	}
	envs, err := s.pipelineEnvironments(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return s.toWebApp(ctx, []track{t}, envs, false)
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
