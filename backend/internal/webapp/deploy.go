package webapp

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

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
	if _, err := s.GetProject(ctx, projectID); err != nil {
		return nil, err
	}
	return s.pipelineEnvironments(ctx, projectID)
}

// Environments returns the per-environment deployment summary of a track.
func (s *Service) Environments(ctx context.Context, webAppID, trackID string) ([]EnvironmentDeployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	envs, bindings, err := s.envBindings(ctx, *t)
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

func (s *Service) envBindings(ctx context.Context, t track) ([]Environment, map[string]gen.ReleaseBinding, error) {
	envs, err := s.pipelineEnvironments(ctx, t.Project)
	if err != nil {
		return nil, nil, err
	}
	list, err := s.oc.ListReleaseBindings(ctx, ns(ctx), t.Name)
	if err != nil {
		return nil, nil, err
	}
	m := map[string]gen.ReleaseBinding{}
	for _, b := range list {
		if b.Spec != nil && b.Spec.Owner.ComponentName == t.Name {
			m[b.Spec.Environment] = b
		}
	}
	return envs, m, nil
}

// Deployments lists the current deployment of the track in each environment
// (stateless P0: no history beyond the current binding).
func (s *Service) Deployments(ctx context.Context, webAppID, trackID string) ([]Deployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	envs, bindings, err := s.envBindings(ctx, *t)
	if err != nil {
		return nil, err
	}
	runs := map[string]gen.WorkflowRun{}
	if list, err := s.listRuns(ctx, t.Name); err == nil {
		for _, r := range list {
			runs[r.Metadata.Name] = r
		}
	}
	var out []Deployment
	for _, e := range envs {
		b, ok := bindings[e.ID]
		if !ok || releaseOf(b) == "" {
			continue
		}
		out = append(out, s.toDeployment(b, runs[releaseOf(b)]))
	}
	if out == nil {
		out = []Deployment{}
	}
	return out, nil
}

func (s *Service) toDeployment(b gen.ReleaseBinding, run gen.WorkflowRun) Deployment {
	rel := releaseOf(b)
	d := Deployment{
		ID: b.Metadata.Name + "." + rel, Environment: b.Spec.Environment, BuildID: rel,
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
	rel, run, err := s.ensureRelease(ctx, t, runName)
	if err != nil {
		return nil, err
	}
	return s.bindRelease(ctx, t, env, rel, run)
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

// ensureRelease cuts (once) the ComponentRelease named after a successful
// build, from the workload that build produced (the run's
// `openchoreo.dev/workload` annotation), with the HTTP endpoint ensured.
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
	if _, err := s.oc.GetComponentRelease(ctx, n, runName); err == nil {
		return runName, *run, nil
	}
	if RunStatus(*run) != BuildSuccess {
		return "", gen.WorkflowRun{}, errf(CodeConflict, "build %q has not succeeded", runName)
	}
	current, err := s.oc.GetComponentWorkload(ctx, n, t.Name)
	if err != nil {
		return "", gen.WorkflowRun{}, err
	}
	desired := current
	if raw := annotation(run.Metadata, AnnOCWorkload); raw != "" {
		var w gen.Workload
		if err := json.Unmarshal([]byte(raw), &w); err == nil && w.Spec != nil {
			desired = &w
		}
	}
	if desired == nil || desired.Spec == nil || desired.Spec.Container == nil {
		return "", gen.WorkflowRun{}, errf(CodeConflict, "build %q produced no workload", runName)
	}
	changed := ensureWorkloadEndpoint(desired.Spec, t)
	if current == nil {
		desired.Metadata = gen.ObjectMeta{Name: t.Name + "-workload"}
		if desired.Spec.Owner == nil {
			desired.Spec.Owner = &struct {
				ComponentName string `json:"componentName"`
				ProjectName   string `json:"projectName"`
			}{ComponentName: t.Name, ProjectName: t.Project}
		}
		if _, err := s.oc.CreateWorkload(ctx, n, *desired); err != nil {
			return "", gen.WorkflowRun{}, fmt.Errorf("create workload: %w", err)
		}
	} else if changed || desired != current {
		desired.Metadata = current.Metadata
		if err := s.oc.UpdateWorkload(ctx, n, *desired); err != nil {
			return "", gen.WorkflowRun{}, fmt.Errorf("update workload: %w", err)
		}
	}
	if err := s.oc.GenerateRelease(ctx, n, t.Name, runName); err != nil {
		return "", gen.WorkflowRun{}, fmt.Errorf("cut release: %w", err)
	}
	return runName, *run, nil
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
	run, _ := s.oc.GetWorkflowRun(ctx, ns(ctx), rel)
	if run == nil {
		run = &gen.WorkflowRun{}
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
	run, _ := s.oc.GetWorkflowRun(ctx, ns(ctx), releaseOf(*b))
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
