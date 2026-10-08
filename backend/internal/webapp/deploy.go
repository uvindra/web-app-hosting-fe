package webapp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// Deployment statuses (frontend DeploymentStatus).
const (
	DeployActive    = "active"
	DeployDeploying = "deploying"
	DeployFailed    = "failed"
	DeployStopped   = "stopped"
)

// RestartMarkerEnv is set on a binding's container env to force a rolling
// restart on redeploy (1.2.5 bindings have no restart field).
const RestartMarkerEnv = "WEB_APP_HOSTING_RESTARTED_AT"

// deploymentStatus maps a ReleaseBinding to a deployment status.
func deploymentStatus(b gen.ReleaseBinding) string {
	if b.Spec != nil && b.Spec.State != nil && *b.Spec.State == gen.ReleaseBindingSpecStateUndeploy {
		return DeployStopped
	}
	if b.Status == nil || b.Status.Conditions == nil {
		return DeployDeploying
	}
	for _, c := range *b.Status.Conditions {
		if c.Type != "Ready" {
			continue
		}
		if c.Status == gen.ConditionStatus("True") {
			return DeployActive
		}
		r := strings.ToLower(c.Reason)
		if strings.Contains(r, "fail") || strings.Contains(r, "error") || strings.Contains(r, "crash") {
			return DeployFailed
		}
	}
	return DeployDeploying
}

// bindingURL returns the binding's public URL.
func (s *Service) bindingURL(b gen.ReleaseBinding) string {
	if b.Status == nil || b.Status.Endpoints == nil {
		return ""
	}
	for _, e := range *b.Status.Endpoints {
		if e.ExternalURLs == nil {
			continue
		}
		u := e.ExternalURLs.Https
		if u == nil || (s.opts.PreferHTTP && e.ExternalURLs.Http != nil) {
			u = e.ExternalURLs.Http
		}
		if u != nil {
			return formatURL(u)
		}
	}
	return ""
}

func formatURL(u *gen.EndpointURL) string {
	scheme := "https"
	if u.Scheme != nil && *u.Scheme != "" {
		scheme = *u.Scheme
	}
	host := u.Host
	if u.Port != nil && !((scheme == "https" && *u.Port == 443) || (scheme == "http" && *u.Port == 80)) {
		host += ":" + strconv.Itoa(int(*u.Port))
	}
	path := ""
	if u.Path != nil && *u.Path != "/" {
		path = *u.Path
	}
	return scheme + "://" + host + path
}

func releaseOf(b gen.ReleaseBinding) string {
	if b.Spec == nil || b.Spec.ReleaseName == nil {
		return ""
	}
	return *b.Spec.ReleaseName
}

// ProjectEnvironments returns the project's pipeline environments.
func (s *Service) ProjectEnvironments(ctx context.Context, projectID string) ([]Environment, error) {
	var envs []Environment
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error { _, err := s.getProject(gctx, projectID); return err })
	g.Go(func() (err error) { envs, err = s.pipelineEnvironments(gctx, projectID); return })
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return envs, nil
}

// Environments returns the per-environment deployment summary of a track.
func (s *Service) Environments(ctx context.Context, webAppID, trackID string) ([]EnvironmentDeployment, error) {
	t, bindings, _, err := s.trackState(ctx, webAppID, trackID, false)
	if err != nil {
		return nil, err
	}
	envs, err := s.pipelineEnvironments(ctx, t.Project)
	if err != nil {
		return nil, err
	}
	out := make([]EnvironmentDeployment, 0, len(envs))
	for _, e := range envs {
		d := EnvironmentDeployment{Environment: e.ID}
		if b, ok := bindings[e.ID]; ok && bindingActive(b) {
			d.Deployed, d.Status = true, webAppStatus(deploymentStatus(b))
		}
		out = append(out, d)
	}
	return out, nil
}

// trackState reads a track together with its bindings (by environment) and,
// when withRuns, its runs (newest first) — concurrently, since all are keyed
// by the track (Component) name.
func (s *Service) trackState(ctx context.Context, webAppID, trackID string, withRuns bool) (*track, map[string]gen.ReleaseBinding, []gen.WorkflowRun, error) {
	var (
		t     *track
		list  []gen.ReleaseBinding
		runs  []gen.WorkflowRun
		runsE error
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { t, err = s.getTrack(gctx, webAppID, trackID); return })
	g.Go(func() (err error) { list, err = s.oc.ListReleaseBindings(gctx, ns(gctx), trackID); return })
	if withRuns {
		g.Go(func() error { runs, runsE = s.listRuns(gctx, trackID); return nil })
	}
	if err := g.Wait(); err != nil {
		return nil, nil, nil, err
	}
	if runsE != nil {
		slog.WarnContext(ctx, "could not list builds", "track", trackID, "error", runsE)
	}
	return t, indexBindings(list)[t.Name], runs, nil
}

// Deployments lists the current deployment of the track in each environment
// (stateless P0: no history beyond the current binding).
func (s *Service) Deployments(ctx context.Context, webAppID, trackID string) ([]Deployment, error) {
	t, bindings, list, err := s.trackState(ctx, webAppID, trackID, true)
	if err != nil {
		return nil, err
	}
	envs, err := s.pipelineEnvironments(ctx, t.Project)
	if err != nil {
		return nil, err
	}
	runs := map[string]gen.WorkflowRun{}
	for _, r := range list {
		runs[r.Metadata.Name] = r
	}
	var out []Deployment
	for _, e := range envs {
		b, ok := bindings[e.ID]
		if !ok || releaseOf(b) == "" {
			continue
		}
		d := s.toDeployment(b, runs[buildOfRelease(releaseOf(b))])
		if t.isImage() {
			if r, err := s.oc.GetComponentRelease(ctx, ns(ctx), releaseOf(b)); err == nil {
				d.Image = releaseImage(r)
			}
		}
		out = append(out, d)
	}
	if out == nil {
		out = []Deployment{}
	}
	return out, nil
}

func (s *Service) toDeployment(b gen.ReleaseBinding, run gen.WorkflowRun) Deployment {
	rel := releaseOf(b)
	d := Deployment{
		ID: b.Metadata.Name + "." + rel, Environment: b.Spec.Environment, BuildID: buildOfRelease(rel),
		CommitSHA: annotation(run.Metadata, AnnCommitSHA), CommitMessage: annotation(run.Metadata, AnnCommitMessage),
		Status: deploymentStatus(b), URL: s.bindingURL(b), DeployedAt: ts(b.Metadata.CreationTimestamp),
	}
	if b.Status != nil && b.Status.LastSpecUpdateTime != nil {
		d.DeployedAt = ts(b.Status.LastSpecUpdateTime)
	}
	return d
}

// Deploy deploys a build to an environment.
func (s *Service) Deploy(ctx context.Context, webAppID, trackID string, in DeployBuildInput) (*Deployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	if in.Build.ID == "" || in.Environment == "" {
		return nil, errf(CodeBadRequest, "environment and build.id are required")
	}
	return s.deployRun(ctx, *t, in.Environment, in.Build.ID)
}

func (s *Service) deployRun(ctx context.Context, t track, env, runName string) (*Deployment, error) {
	if err := s.checkEnv(ctx, t, env); err != nil {
		return nil, err
	}
	if err := s.checkEnvironmentAllowed(ctx, t.Project, env); err != nil {
		return nil, err
	}
	unlock, err := s.lockTrack(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	defer unlock()
	return s.deployRunLocked(ctx, t, env, runName)
}

// deployRunLocked is deployRun for a caller already holding lockTrack.
func (s *Service) deployRunLocked(ctx context.Context, t track, env, runName string) (*Deployment, error) {
	ready := s.prepareForDeploy(ctx, t)
	rel, run, err := s.ensureRelease(ctx, t, runName)
	if err != nil {
		return nil, err
	}
	if ready {
		rel = s.upgradeForDeploy(ctx, t, rel)
	}
	return s.bindRelease(ctx, t, env, rel, run)
}

// lockTrack serializes deploys of one track. A release is cut by writing the
// build's workload onto the track's single shared Workload and then
// snapshotting it (OpenChoreo has no "release from this workload" call short
// of re-supplying the frozen ComponentType), so two concurrent deploys of the
// same track could otherwise snapshot each other's image.
//
// The lock is process-local: with several BFF replicas two deploys of one
// track can still interleave. ensureRelease's image check is the backstop —
// a mismatched snapshot is deleted and re-cut, or the deploy fails loudly;
// a wrong image is never bound.
func (s *Service) lockTrack(ctx context.Context, component string) (func(), error) {
	v, _ := s.trackLocks.LoadOrStore(ns(ctx)+"/"+component, make(chan struct{}, 1))
	sem := v.(chan struct{})
	select {
	case sem <- struct{}{}:
		return func() { <-sem }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// prepareForDeploy makes sure releases cut for t carry the current
// ComponentType and the HPA trait: the platform resources are ensured and
// the trait attached. Best effort — it reports false (and the deploy goes
// ahead with whatever the namespace has) when either fails.
func (s *Service) prepareForDeploy(ctx context.Context, t track) bool {
	if err := s.EnsurePlatformResources(ctx); err != nil {
		slog.WarnContext(ctx, "platform resources not ensured; deploying without upgrading the release", "track", t.Name, "error", err)
		return false
	}
	if err := s.ensureTrackTrait(ctx, t); err != nil {
		slog.WarnContext(ctx, "could not attach the HPA trait; deploying without upgrading the release", "track", t.Name, "error", err)
		return false
	}
	return true
}

// upgradeForDeploy returns the release to bind for a deploy or promotion:
// release itself, or its re-cut copy when it predates the current
// ComponentType (so a binding's P1 settings keep applying). Best effort: when
// the re-cut fails, the release is bound as is. Callers hold lockTrack and
// have run prepareForDeploy.
func (s *Service) upgradeForDeploy(ctx context.Context, t track, release string) string {
	cur, err := s.currentReleaseLocked(ctx, t, release)
	if err != nil {
		slog.WarnContext(ctx, "could not upgrade the release to the current ComponentType; deploying it as is", "release", release, "error", err)
		return release
	}
	return cur
}

func (s *Service) bindRelease(ctx context.Context, t track, env, release string, run gen.WorkflowRun) (*Deployment, error) {
	if err := s.oc.EnsureProjectReleaseBinding(ctx, ns(ctx), t.Project, env); err != nil {
		return nil, fmt.Errorf("prepare environment %q for project %q: %w", env, t.Project, err)
	}
	active := gen.ReleaseBindingSpecStateActive
	b, err := s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		spec.ReleaseName = &release
		spec.State = &active
	})
	if err != nil {
		return nil, err
	}
	d := s.toDeployment(*b, run)
	d.Status = DeployDeploying
	return &d, nil
}

func (s *Service) checkEnv(ctx context.Context, t track, env string) error {
	envs, err := s.pipelineEnvironments(ctx, t.Project)
	if err != nil {
		return err
	}
	for _, e := range envs {
		if e.ID == env {
			return nil
		}
	}
	return errf(CodeBadRequest, "environment %q is not in the project's deployment pipeline", env)
}

// releaseCutAttempts bounds how often ensureRelease re-cuts a release whose
// snapshot did not hold the build's image.
const releaseCutAttempts = 3

// ensureRelease cuts (once) the ComponentRelease named after a successful
// build, from the workload that build produced (the run's
// `openchoreo.dev/workload` annotation), with the HTTP endpoint ensured.
// Callers hold lockTrack. The release's frozen image is checked against the
// build's image both for an existing release and after cutting a new one.
func (s *Service) ensureRelease(ctx context.Context, t track, runName string) (string, gen.WorkflowRun, error) {
	n := ns(ctx)
	run, err := s.oc.GetWorkflowRun(ctx, n, runName)
	if err != nil {
		if notFound(err) {
			return "", gen.WorkflowRun{}, errf(CodeNotFound, "build %q not found", runName)
		}
		return "", gen.WorkflowRun{}, err
	}
	if label(run.Metadata, LabelOCComponent) != t.Name {
		return "", gen.WorkflowRun{}, errf(CodeNotFound, "build %q not found", runName)
	}
	built := builtWorkload(*run)
	if rel, err := s.oc.GetComponentRelease(ctx, n, runName); err == nil {
		got, want := releaseImage(rel), workloadImage(built)
		if want == "" || got == want {
			return runName, *run, nil
		}
		if err := s.dropMismatchedRelease(ctx, t, runName, got, want); err != nil {
			return "", gen.WorkflowRun{}, err
		}
	} else if !notFound(err) {
		return "", gen.WorkflowRun{}, err
	}
	if RunStatus(*run) != BuildSuccess {
		return "", gen.WorkflowRun{}, errf(CodeConflict, "build %q has not succeeded", runName)
	}
	for attempt := 1; ; attempt++ {
		want, err := s.writeBuildWorkload(ctx, t, runName, built)
		if err != nil {
			return "", gen.WorkflowRun{}, err
		}
		if err := s.oc.GenerateRelease(ctx, n, t.Name, runName); err != nil {
			return "", gen.WorkflowRun{}, fmt.Errorf("cut release: %w", err)
		}
		rel, err := s.oc.GetComponentRelease(ctx, n, runName)
		if err != nil {
			return "", gen.WorkflowRun{}, fmt.Errorf("read back release %q: %w", runName, err)
		}
		got := releaseImage(rel)
		if got == want {
			return runName, *run, nil
		}
		// Another writer (e.g. a second BFF replica) changed the track's
		// workload between our write and the snapshot.
		slog.WarnContext(ctx, "release snapshot holds the wrong image; re-cutting", "release", runName, "want", want, "got", got, "attempt", attempt)
		if err := s.oc.DeleteComponentRelease(ctx, n, runName); err != nil {
			return "", gen.WorkflowRun{}, fmt.Errorf("delete mismatched release %q: %w", runName, err)
		}
		if attempt == releaseCutAttempts {
			return "", gen.WorkflowRun{}, errf(CodeConflict, "could not cut release %q with the build's image %s (the track's workload kept changing; another deploy may be running) — try again", runName, want)
		}
		select {
		case <-time.After(time.Duration(attempt) * s.opts.ReleaseVerifyWait):
		case <-ctx.Done():
			return "", gen.WorkflowRun{}, ctx.Err()
		}
	}
}

// writeBuildWorkload writes the build's workload (or, for a run without one,
// keeps the current workload) onto the track's Workload, with the HTTP
// endpoint ensured, and returns the image it holds.
func (s *Service) writeBuildWorkload(ctx context.Context, t track, runName string, built *gen.Workload) (string, error) {
	n := ns(ctx)
	current, err := s.oc.GetComponentWorkload(ctx, n, t.Name)
	if err != nil {
		return "", err
	}
	desired := current
	if built != nil {
		desired = cloneWorkload(built)
	}
	if desired == nil || desired.Spec == nil || desired.Spec.Container == nil {
		return "", errf(CodeConflict, "build %q produced no workload", runName)
	}
	changed := ensureWorkloadEndpoint(desired.Spec, t)
	switch {
	case current == nil:
		desired.Metadata = gen.ObjectMeta{Name: t.Name + "-workload"}
		if desired.Spec.Owner == nil {
			desired.Spec.Owner = &struct {
				ComponentName string `json:"componentName"`
				ProjectName   string `json:"projectName"`
			}{ComponentName: t.Name, ProjectName: t.Project}
		}
		if _, err := s.oc.CreateWorkload(ctx, n, *desired); err != nil {
			return "", fmt.Errorf("create workload: %w", err)
		}
	case changed || desired != current:
		desired.Metadata = current.Metadata
		if desired.Spec.Owner == nil {
			desired.Spec.Owner = current.Spec.Owner
		}
		if err := s.oc.UpdateWorkload(ctx, n, *desired); err != nil {
			return "", fmt.Errorf("update workload: %w", err)
		}
	}
	return desired.Spec.Container.Image, nil
}

// dropMismatchedRelease handles an existing release named after a build
// whose frozen image is not the build's (cut during a concurrent deploy
// before deploys were serialized, or by another replica). An unbound one is
// deleted so it can be re-cut; a bound one is reported, never silently reused.
func (s *Service) dropMismatchedRelease(ctx context.Context, t track, release, got, want string) error {
	n := ns(ctx)
	bindings, err := s.oc.ListReleaseBindings(ctx, n, t.Name)
	if err != nil {
		return err
	}
	for _, b := range bindings {
		if releaseOf(b) == release {
			return errf(CodeConflict, "release %q is deployed in %s with image %s, not this build's image %s; trigger a new build and deploy it", release, b.Spec.Environment, got, want)
		}
	}
	slog.WarnContext(ctx, "existing release holds the wrong image; re-cutting", "release", release, "want", want, "got", got)
	if err := s.oc.DeleteComponentRelease(ctx, n, release); err != nil {
		return fmt.Errorf("delete mismatched release %q: %w", release, err)
	}
	return nil
}

// builtWorkload returns the workload a run's generate-workload step produced
// (the `openchoreo.dev/workload` annotation), or nil when it has none.
func builtWorkload(run gen.WorkflowRun) *gen.Workload {
	raw := annotation(run.Metadata, AnnOCWorkload)
	if raw == "" {
		return nil
	}
	var w gen.Workload
	if err := json.Unmarshal([]byte(raw), &w); err != nil || w.Spec == nil {
		return nil
	}
	return &w
}

func workloadImage(w *gen.Workload) string {
	if w == nil || w.Spec == nil || w.Spec.Container == nil {
		return ""
	}
	return w.Spec.Container.Image
}

func cloneWorkload(w *gen.Workload) *gen.Workload {
	raw, _ := json.Marshal(w)
	var out gen.Workload
	_ = json.Unmarshal(raw, &out)
	return &out
}

// releaseImage returns the container image frozen into a release.
func releaseImage(r *gen.ComponentRelease) string {
	if r == nil || r.Spec == nil {
		return ""
	}
	c, _ := r.Spec.Workload["container"].(map[string]any)
	img, _ := c["image"].(string)
	return img
}

// ensureWorkloadEndpoint adds the external HTTP endpoint (and PORT env for
// server presets) when the build's workload declares none — the Paketo and
// Dockerfile builders' generate-workload step has no descriptor (E4).
func ensureWorkloadEndpoint(spec *gen.WorkloadSpec, t track) bool {
	if spec.Endpoints != nil && len(*spec.Endpoints) > 0 {
		return false
	}
	port := t.Port
	if port == 0 {
		port = RuntimePort(t.Preset, 0)
	}
	vis := []gen.WorkloadEndpointVisibility{gen.WorkloadEndpointVisibilityExternal}
	spec.Endpoints = &map[string]gen.WorkloadEndpoint{"http": {Port: port, Type: gen.WorkloadEndpointTypeHTTP, Visibility: &vis}}
	if !t.Preset.IsSPA() && spec.Container != nil {
		env := []gen.EnvVar{}
		if spec.Container.Env != nil {
			env = *spec.Container.Env
		}
		has := false
		for _, e := range env {
			has = has || e.Key == "PORT"
		}
		if !has {
			env = append(env, gen.EnvVar{Key: "PORT", Value: ptr(strconv.Itoa(port))})
			spec.Container.Env = &env
		}
	}
	return true
}

// Promote binds the release running in source to target.
func (s *Service) Promote(ctx context.Context, webAppID, trackID string, in PromoteInput) (*Deployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	if err := s.checkEnv(ctx, *t, in.TargetEnvironment); err != nil {
		return nil, err
	}
	if err := s.checkEnvironmentAllowed(ctx, t.Project, in.TargetEnvironment); err != nil {
		return nil, err
	}
	src, err := s.oc.FindBinding(ctx, ns(ctx), t.Name, in.SourceEnvironment)
	if err != nil {
		return nil, err
	}
	// A release bound in the source is enough (it may be mid-rollout after a
	// config change); a failed or stopped source is not promoted.
	if src == nil || !bindingActive(*src) || deploymentStatus(*src) == DeployFailed {
		return nil, errf(CodeConflict, "nothing to promote: %s has no running deployment", in.SourceEnvironment)
	}
	rel := releaseOf(*src)
	run, _ := s.oc.GetWorkflowRun(ctx, ns(ctx), buildOfRelease(rel))
	if run == nil {
		run = &gen.WorkflowRun{}
	}
	unlock, err := s.lockTrack(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	defer unlock()
	if s.prepareForDeploy(ctx, *t) {
		rel = s.upgradeForDeploy(ctx, *t, rel)
	}
	return s.bindRelease(ctx, *t, in.TargetEnvironment, rel, *run)
}

// Redeploy re-applies an environment's binding: reactivates a stopped one,
// or forces a rolling restart of a running one.
func (s *Service) Redeploy(ctx context.Context, webAppID, trackID, env string) (*Deployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	cur, err := s.oc.FindBinding(ctx, ns(ctx), t.Name, env)
	if err != nil {
		return nil, err
	}
	if cur == nil || releaseOf(*cur) == "" {
		return nil, errf(CodeConflict, "nothing to redeploy in %s", env)
	}
	stopped := deploymentStatus(*cur) == DeployStopped
	active := gen.ReleaseBindingSpecStateActive
	b, err := s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		spec.State = &active
		if !stopped {
			setOverrideEnv(spec, RestartMarkerEnv, time.Now().UTC().Format(time.RFC3339))
		}
	})
	if err != nil {
		return nil, err
	}
	run, _ := s.oc.GetWorkflowRun(ctx, ns(ctx), buildOfRelease(releaseOf(*b)))
	if run == nil {
		run = &gen.WorkflowRun{}
	}
	d := s.toDeployment(*b, *run)
	d.Status = DeployDeploying
	return &d, nil
}

// Stop undeploys an environment (binding state Undeploy).
func (s *Service) Stop(ctx context.Context, webAppID, trackID, env string) (*Deployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	cur, err := s.oc.FindBinding(ctx, ns(ctx), t.Name, env)
	if err != nil {
		return nil, err
	}
	if cur == nil || releaseOf(*cur) == "" {
		return nil, errf(CodeConflict, "nothing to stop in %s", env)
	}
	undeploy := gen.ReleaseBindingSpecStateUndeploy
	b, err := s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		spec.State = &undeploy
	})
	if err != nil {
		return nil, err
	}
	d := s.toDeployment(*b, gen.WorkflowRun{})
	d.Status = DeployStopped
	return &d, nil
}

func setOverrideEnv(spec *gen.ReleaseBindingSpec, key, value string) {
	if spec.WorkloadOverrides == nil {
		spec.WorkloadOverrides = &gen.WorkloadOverrides{}
	}
	if spec.WorkloadOverrides.Container == nil {
		spec.WorkloadOverrides.Container = &gen.ContainerOverride{}
	}
	env := []gen.EnvVar{}
	if spec.WorkloadOverrides.Container.Env != nil {
		env = *spec.WorkloadOverrides.Container.Env
	}
	for i := range env {
		if env[i].Key == key {
			env[i].Value, env[i].ValueFrom = &value, nil
			spec.WorkloadOverrides.Container.Env = &env
			return
		}
	}
	env = append(env, gen.EnvVar{Key: key, Value: &value})
	spec.WorkloadOverrides.Container.Env = &env
}
