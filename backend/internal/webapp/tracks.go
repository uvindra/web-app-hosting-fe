package webapp

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// track is a deployment track = one OC Component (D3).
type track struct {
	comp           gen.Component
	Name           string
	WebApp         string
	Project        string
	Branch         string
	IsDefault      bool
	Preset         Preset
	Port           int
	RepoURL        string
	SourceType     string
	InstallationID int64
	AutoDeploy     bool
	AppPath        string
}

func trackOf(c gen.Component) track {
	t := track{
		comp:       c,
		Name:       c.Metadata.Name,
		WebApp:     label(c.Metadata, LabelWebApp),
		Branch:     annotation(c.Metadata, AnnBranch),
		IsDefault:  annotation(c.Metadata, AnnDefaultTrack) == "true",
		Preset:     Preset(annotation(c.Metadata, AnnPreset)),
		RepoURL:    annotation(c.Metadata, AnnRepoURL),
		SourceType: annotation(c.Metadata, AnnSourceType),
		AutoDeploy: annotation(c.Metadata, AnnAutoDeploy) == "true",
	}
	if c.Spec != nil {
		t.Project = c.Spec.Owner.ProjectName
	}
	t.Port, _ = strconv.Atoi(annotation(c.Metadata, AnnPort))
	t.InstallationID, _ = strconv.ParseInt(annotation(c.Metadata, AnnInstallationID), 10, 64)
	repo := t.repoParams()
	if t.Branch == "" {
		t.Branch, _ = nested(repo, "revision", "branch").(string)
	}
	if t.RepoURL == "" {
		t.RepoURL, _ = repo["url"].(string)
	}
	t.AppPath, _ = repo["appPath"].(string)
	return t
}

func (t track) params() map[string]any {
	if t.comp.Spec == nil || t.comp.Spec.Workflow == nil || t.comp.Spec.Workflow.Parameters == nil {
		return map[string]any{}
	}
	return *t.comp.Spec.Workflow.Parameters
}

func (t track) repoParams() map[string]any {
	r, _ := t.params()["repository"].(map[string]any)
	if r == nil {
		return map[string]any{}
	}
	return r
}

func (t track) repoRef() platform.RepoRef {
	ref := platform.RepoRef{URL: t.RepoURL, Branch: t.Branch, AppPath: t.AppPath, InstallationID: t.InstallationID}
	ref.Owner, ref.Repo, _ = platform.ParseGitHubURL(t.RepoURL)
	return ref
}

func nested(m map[string]any, keys ...string) any {
	var cur any = m
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}

// webAppTracks returns all tracks of a web app (default first).
func (s *Service) webAppTracks(ctx context.Context, webAppID string) ([]track, error) {
	if !ValidHandle(webAppID) {
		return nil, errf(CodeNotFound, "web app %q not found", webAppID)
	}
	comps, err := s.oc.ListComponents(ctx, ns(ctx), "", LabelWebApp+"="+webAppID)
	if err != nil {
		return nil, err
	}
	if len(comps) == 0 {
		return nil, errf(CodeNotFound, "web app %q not found", webAppID)
	}
	out := make([]track, 0, len(comps))
	for _, c := range comps {
		out = append(out, trackOf(c))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].IsDefault != out[j].IsDefault {
			return out[i].IsDefault
		}
		return out[i].Branch < out[j].Branch
	})
	return out, nil
}

// getTrack returns one track and checks it belongs to the web app.
func (s *Service) getTrack(ctx context.Context, webAppID, trackID string) (*track, error) {
	c, err := s.oc.GetComponent(ctx, ns(ctx), trackID)
	if err != nil {
		if notFound(err) {
			return nil, errf(CodeNotFound, "deployment track %q not found", trackID)
		}
		return nil, err
	}
	t := trackOf(*c)
	if t.WebApp != webAppID {
		return nil, errf(CodeNotFound, "deployment track %q not found in web app %q", trackID, webAppID)
	}
	return &t, nil
}

// ListTracks lists a web app's deployment tracks.
// The tracks and the namespace's bindings are read once each, concurrently
// (not one binding list per track).
func (s *Service) ListTracks(ctx context.Context, webAppID string) ([]DeploymentTrack, error) {
	var (
		tracks   []track
		bindings []gen.ReleaseBinding
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { tracks, err = s.webAppTracks(gctx, webAppID); return })
	g.Go(func() (err error) { bindings, err = s.oc.ListReleaseBindings(gctx, ns(gctx), ""); return })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	idx := indexBindings(bindings)
	out := make([]DeploymentTrack, 0, len(tracks))
	for _, t := range tracks {
		out = append(out, DeploymentTrack{
			ID: t.Name, Branch: t.Branch, IsDefault: t.IsDefault, AutoDeploy: t.AutoDeploy,
			Deployed: anyActive(idx[t.Name]), CreatedAt: ts(t.comp.Metadata.CreationTimestamp),
		})
	}
	return out, nil
}

func anyActive(byEnv map[string]gen.ReleaseBinding) bool {
	for _, b := range byEnv {
		if bindingActive(b) {
			return true
		}
	}
	return false
}

// trackDeployed reports whether any environment has an active binding.
func (s *Service) trackDeployed(ctx context.Context, component string) (bool, error) {
	bindings, err := s.oc.ListReleaseBindings(ctx, ns(ctx), component)
	if err != nil {
		return false, err
	}
	for _, b := range bindings {
		if bindingActive(b) {
			return true, nil
		}
	}
	return false, nil
}

func bindingActive(b gen.ReleaseBinding) bool {
	if b.Spec == nil || b.Spec.ReleaseName == nil || *b.Spec.ReleaseName == "" {
		return false
	}
	return b.Spec.State == nil || *b.Spec.State != gen.ReleaseBindingSpecStateUndeploy
}

// RepoBranches lists the web app repository's branches.
func (s *Service) RepoBranches(ctx context.Context, webAppID string) ([]string, error) {
	tracks, err := s.webAppTracks(ctx, webAppID)
	if err != nil {
		return nil, err
	}
	return s.p.Git.ListBranches(ctx, tracks[0].repoRef())
}

// CreateTrack creates a deployment track from another branch: a new Component
// cloned from the default track with that branch, then builds it.
func (s *Service) CreateTrack(ctx context.Context, webAppID, branch string) (*DeploymentTrack, error) {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return nil, errf(CodeBadRequest, "branch is required")
	}
	tracks, err := s.webAppTracks(ctx, webAppID)
	if err != nil {
		return nil, err
	}
	for _, t := range tracks {
		if t.Branch == branch {
			return nil, errf(CodeConflict, "a deployment track for branch %q already exists", branch)
		}
	}
	def := tracks[0]
	branches, err := s.p.Git.ListBranches(ctx, def.repoRef())
	if err != nil {
		return nil, fmt.Errorf("list repository branches: %w", err)
	}
	if !slices.Contains(branches, branch) {
		return nil, errf(CodeBadRequest, "branch %q was not found in the repository", branch)
	}
	if err := s.EnsurePlatformResources(ctx); err != nil {
		return nil, err
	}
	comp, err := s.createTrackComponent(ctx, def.Project, trackSpec{
		WebApp: webAppID, Branch: branch, IsDefault: false, Preset: def.Preset, Port: def.Port,
		RepoURL: def.RepoURL, SourceType: def.SourceType, InstallationID: def.InstallationID,
		DisplayName: annotation(def.comp.Metadata, AnnDisplayName), Description: annotation(def.comp.Metadata, AnnDescription),
		AutoDeploy: false, Params: withBranch(def.params(), branch),
		WorkflowKind: workflowKind(def.comp), WorkflowName: workflowName(def.comp),
	})
	if err != nil {
		return nil, err
	}
	t := trackOf(*comp)
	if err := s.p.Git.BindSource(ctx, t.repoRef(), t.Project, t.Name); err != nil {
		return nil, fmt.Errorf("bind git source: %w", err)
	}
	if _, err := s.TriggerBuild(ctx, webAppID, t.Name, ""); err != nil {
		return nil, fmt.Errorf("track created but the first build failed to start: %w", err)
	}
	return &DeploymentTrack{ID: t.Name, Branch: branch, AutoDeploy: false, CreatedAt: ts(comp.Metadata.CreationTimestamp)}, nil
}

func withBranch(params map[string]any, branch string) map[string]any {
	out := deepCopy(params).(map[string]any)
	repo, _ := out["repository"].(map[string]any)
	if repo == nil {
		repo = map[string]any{}
		out["repository"] = repo
	}
	rev, _ := repo["revision"].(map[string]any)
	if rev == nil {
		rev = map[string]any{}
		repo["revision"] = rev
	}
	rev["branch"], rev["commit"] = branch, ""
	return out
}

func deepCopy(v any) any {
	switch t := v.(type) {
	case map[string]any:
		m := make(map[string]any, len(t))
		for k, vv := range t {
			m[k] = deepCopy(vv)
		}
		return m
	case []any:
		l := make([]any, len(t))
		for i, vv := range t {
			l[i] = deepCopy(vv)
		}
		return l
	default:
		return v
	}
}

func workflowKind(c gen.Component) string {
	if c.Spec != nil && c.Spec.Workflow != nil && c.Spec.Workflow.Kind != nil {
		return string(*c.Spec.Workflow.Kind)
	}
	return "ClusterWorkflow"
}

func workflowName(c gen.Component) string {
	if c.Spec != nil && c.Spec.Workflow != nil {
		return c.Spec.Workflow.Name
	}
	return ""
}

// CheckTrackDeletable reports whether a track can be deleted.
func (s *Service) CheckTrackDeletable(ctx context.Context, webAppID, trackID string) (*TrackDeletableResult, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		if e, ok := AsError(err); ok && e.Code == CodeNotFound {
			return &TrackDeletableResult{CanDelete: false, Message: "Deployment track not found."}, nil
		}
		return nil, err
	}
	if t.IsDefault {
		return &TrackDeletableResult{CanDelete: false, Message: "The default deployment track cannot be deleted."}, nil
	}
	deployed, err := s.trackDeployed(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	if deployed {
		return &TrackDeletableResult{CanDelete: false, Message: "This track has active deployments. Undeploy it from all environments first."}, nil
	}
	return &TrackDeletableResult{CanDelete: true}, nil
}

// DeleteTrack deletes an undeployed, non-default track: its bindings, then
// its Component.
func (s *Service) DeleteTrack(ctx context.Context, webAppID, trackID string) error {
	res, err := s.CheckTrackDeletable(ctx, webAppID, trackID)
	if err != nil {
		return err
	}
	if !res.CanDelete {
		return errf(CodeConflict, "%s", res.Message)
	}
	n := ns(ctx)
	bindings, err := s.oc.ListReleaseBindings(ctx, n, trackID)
	if err != nil {
		return err
	}
	for _, b := range bindings {
		if err := s.oc.DeleteReleaseBinding(ctx, n, b.Metadata.Name); err != nil {
			return err
		}
	}
	return s.oc.DeleteComponent(ctx, n, trackID)
}

// SetAutoDeploy toggles a track's auto-deploy (deploy to the first
// environment after each successful build).
func (s *Service) SetAutoDeploy(ctx context.Context, webAppID, trackID string, on bool) (*DeploymentTrack, error) {
	if _, err := s.getTrack(ctx, webAppID, trackID); err != nil {
		return nil, err
	}
	comp, err := s.oc.MutateComponent(ctx, ns(ctx), trackID, func(c *gen.Component) {
		setAnnotation(&c.Metadata, AnnAutoDeploy, strconv.FormatBool(on))
	})
	if err != nil {
		return nil, err
	}
	t := trackOf(*comp)
	deployed, err := s.trackDeployed(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	return &DeploymentTrack{ID: t.Name, Branch: t.Branch, IsDefault: t.IsDefault, AutoDeploy: t.AutoDeploy, Deployed: deployed, CreatedAt: ts(comp.Metadata.CreationTimestamp)}, nil
}

// trackSpec is the input for a track Component.
type trackSpec struct {
	WebApp, Branch, RepoURL, SourceType, DisplayName, Description string
	IsDefault, AutoDeploy                                         bool
	Preset                                                        Preset
	Port                                                          int
	InstallationID                                                int64
	Params                                                        map[string]any
	WorkflowKind, WorkflowName                                    string
}

func (s *Service) createTrackComponent(ctx context.Context, project string, in trackSpec) (*gen.Component, error) {
	labels := map[string]string{
		LabelProduct: ProductName,
		LabelWebApp:  in.WebApp,
		LabelTrack:   Slug(in.Branch, 63),
	}
	ann := map[string]string{
		AnnDisplayName: in.DisplayName, AnnDescription: in.Description, AnnPreset: string(in.Preset),
		AnnDefaultTrack: strconv.FormatBool(in.IsDefault), AnnPort: strconv.Itoa(in.Port),
		AnnSourceType: in.SourceType, AnnRepoURL: in.RepoURL, AnnAutoDeploy: strconv.FormatBool(in.AutoDeploy),
		AnnBranch: in.Branch, ocDisplayName: in.DisplayName,
	}
	if in.InstallationID > 0 {
		ann[AnnInstallationID] = strconv.FormatInt(in.InstallationID, 10)
	}
	spec := &gen.ComponentSpec{AutoDeploy: ptr(false), AutoBuild: ptr(false)}
	spec.Owner.ProjectName = project
	kind := gen.ComponentSpecComponentTypeKindComponentType
	spec.ComponentType.Kind = &kind
	spec.ComponentType.Name = "deployment/web-app-hosting"
	wk := gen.ComponentWorkflowConfigKind(in.WorkflowKind)
	params := in.Params
	spec.Workflow = &gen.ComponentWorkflowConfig{Kind: &wk, Name: in.WorkflowName, Parameters: &params}
	comp, err := s.oc.CreateComponent(ctx, ns(ctx), gen.Component{
		Metadata: gen.ObjectMeta{Name: TrackComponentName(in.WebApp, in.Branch, in.IsDefault), Labels: &labels, Annotations: &ann},
		Spec:     spec,
	})
	if errors.Is(err, openchoreo.ErrConflict) {
		return nil, errf(CodeConflict, "a component named %q already exists", TrackComponentName(in.WebApp, in.Branch, in.IsDefault))
	}
	return comp, err
}

func ptr[T any](v T) *T { return &v }
