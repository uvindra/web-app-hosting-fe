package webapp

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

// Options configures the Service.
type Options struct {
	Profile        platformres.Profile
	DefaultProject string
	// PreferHTTP picks the http external URL over https when a binding
	// advertises both (local k3d gateways do not terminate TLS).
	PreferHTTP bool
	// WatchInterval is how often a post-build watcher polls a run.
	WatchInterval time.Duration
	WatchTimeout  time.Duration
	// EnvCacheTTL is how long a project's pipeline environments are reused
	// (0 = 30s, <0 = off). They change rarely and every page reads them.
	EnvCacheTTL time.Duration
}

// Service implements the Web App Hosting operations.
type Service struct {
	oc   *openchoreo.Client
	p    *platform.Platform
	opts Options

	ensured sync.Map // namespace -> platformres.Version ensured
	watches sync.Map // run name -> struct{}
	envs    *ttlCache[[]Environment]
	// async tracks background follow-up work (first builds) so tests can wait.
	async sync.WaitGroup
}

// New builds a Service.
func New(oc *openchoreo.Client, p *platform.Platform, opts Options) *Service {
	if opts.WatchInterval == 0 {
		opts.WatchInterval = 10 * time.Second
	}
	if opts.WatchTimeout == 0 {
		opts.WatchTimeout = 45 * time.Minute
	}
	if opts.DefaultProject == "" {
		opts.DefaultProject = "default"
	}
	if opts.EnvCacheTTL == 0 {
		opts.EnvCacheTTL = 30 * time.Second
	}
	return &Service{oc: oc, p: p, opts: opts, envs: newTTLCache[[]Environment](opts.EnvCacheTTL)}
}

func ns(ctx context.Context) string {
	if o := auth.OrgFrom(ctx); o != nil {
		return o.Namespace
	}
	return ""
}

// Meta reports the target configuration to the console.
func (s *Service) Meta(ctx context.Context) Meta {
	m := Meta{Target: s.p.Target, GitHubApp: s.p.Git.GitHubAppEnabled(), BillingEnabled: s.p.BillingEnabled}
	if o := auth.OrgFrom(ctx); o != nil {
		m.OrgHandle, m.Namespace = o.Handle, o.Namespace
	}
	return m
}

// EnsurePlatformResources upserts our ComponentType + SPA workflow into the
// org namespace (D9), once per process per namespace.
func (s *Service) EnsurePlatformResources(ctx context.Context) error {
	n := ns(ctx)
	if v, ok := s.ensured.Load(n); ok && v.(int) >= platformres.Version {
		return nil
	}
	wf, err := platformres.SPAWorkflow(s.opts.Profile)
	if err != nil {
		return err
	}
	if err := s.oc.EnsureVersioned(ctx, n, openchoreo.KindWorkflow, wf); err != nil {
		return fmt.Errorf("ensure SPA workflow: %w", err)
	}
	ct, err := platformres.ComponentType(s.opts.Profile)
	if err != nil {
		return err
	}
	if err := s.oc.EnsureVersioned(ctx, n, openchoreo.KindComponentType, ct); err != nil {
		return fmt.Errorf("ensure ComponentType: %w", err)
	}
	s.ensured.Store(n, platformres.Version)
	return nil
}

// ---- environments ----

// pipelineEnvironments returns the project's environments in promotion
// order. The environment list, the project and the default pipeline are read
// concurrently, and the result is cached briefly (EnvCacheTTL).
func (s *Service) pipelineEnvironments(ctx context.Context, project string) ([]Environment, error) {
	n := ns(ctx)
	key := n + "/" + project
	if v, ok := s.envs.get(key); ok {
		return slices.Clone(v), nil
	}
	var (
		envs         []gen.Environment
		pipelineName = "default"
		dp           *gen.DeploymentPipeline
		dpErr        error
	)
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		envs, err = s.oc.ListEnvironments(gctx, n)
		return err
	})
	g.Go(func() error {
		if p, err := s.oc.GetProject(gctx, n, project); err == nil && p.Spec != nil && p.Spec.DeploymentPipelineRef != nil && p.Spec.DeploymentPipelineRef.Name != "" {
			pipelineName = p.Spec.DeploymentPipelineRef.Name
		}
		return nil
	})
	g.Go(func() error {
		// Speculatively read the default pipeline (what almost every project uses).
		dp, dpErr = s.oc.GetDeploymentPipeline(gctx, n, "default")
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, err
	}
	if pipelineName != "default" {
		dp, dpErr = s.oc.GetDeploymentPipeline(ctx, n, pipelineName)
	}
	byName := map[string]gen.Environment{}
	for _, e := range envs {
		byName[e.Metadata.Name] = e
	}
	var order []string
	if dpErr == nil {
		order = PromotionOrder(dp)
	} else {
		slog.WarnContext(ctx, "deployment pipeline not readable; falling back to environment list", "pipeline", pipelineName, "error", dpErr)
	}
	if len(order) == 0 {
		for name := range byName {
			order = append(order, name)
		}
		sort.Strings(order)
	}
	out := make([]Environment, 0, len(order))
	for _, name := range order {
		e, ok := byName[name]
		env := Environment{ID: name, Name: name}
		if ok {
			if d := annotation(e.Metadata, ocDisplayName); d != "" {
				env.Name = d
			}
			env.IsProduction = e.Spec != nil && e.Spec.IsProduction != nil && *e.Spec.IsProduction
		}
		out = append(out, env)
	}
	if dpErr == nil {
		s.envs.set(key, out)
	}
	return slices.Clone(out), nil
}

// bindingIndex maps component -> environment -> its ReleaseBinding.
type bindingIndex map[string]map[string]gen.ReleaseBinding

func indexBindings(list []gen.ReleaseBinding) bindingIndex {
	idx := bindingIndex{}
	for _, b := range list {
		if b.Spec == nil || b.Spec.Owner.ComponentName == "" {
			continue
		}
		c := b.Spec.Owner.ComponentName
		if idx[c] == nil {
			idx[c] = map[string]gen.ReleaseBinding{}
		}
		idx[c][b.Spec.Environment] = b
	}
	return idx
}

// PromotionOrder linearizes a pipeline's promotion paths: roots first, then
// breadth-first along targetEnvironmentRefs.
func PromotionOrder(dp *gen.DeploymentPipeline) []string {
	if dp == nil || dp.Spec == nil || dp.Spec.PromotionPaths == nil {
		return nil
	}
	next := map[string][]string{}
	isTarget := map[string]bool{}
	var sources []string
	for _, p := range *dp.Spec.PromotionPaths {
		src := p.SourceEnvironmentRef.Name
		sources = append(sources, src)
		for _, t := range p.TargetEnvironmentRefs {
			next[src] = append(next[src], t.Name)
			isTarget[t.Name] = true
		}
	}
	var queue, out []string
	seen := map[string]bool{}
	for _, s := range sources {
		if !isTarget[s] && !seen[s] {
			queue = append(queue, s)
			seen[s] = true
		}
	}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		out = append(out, cur)
		for _, t := range next[cur] {
			if !seen[t] {
				seen[t] = true
				queue = append(queue, t)
			}
		}
	}
	return out
}

// nextEnvironment returns the environment after env in order, or "".
func nextEnvironment(order []Environment, env string) string {
	for i, e := range order {
		if e.ID == env && i+1 < len(order) {
			return order[i+1].ID
		}
	}
	return ""
}

// ---- helpers ----

func annotation(m gen.ObjectMeta, key string) string {
	if m.Annotations == nil {
		return ""
	}
	return (*m.Annotations)[key]
}

func label(m gen.ObjectMeta, key string) string {
	if m.Labels == nil {
		return ""
	}
	return (*m.Labels)[key]
}

func setAnnotation(m *gen.ObjectMeta, key, value string) {
	if m.Annotations == nil {
		m.Annotations = &map[string]string{}
	}
	(*m.Annotations)[key] = value
}

func ts(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func notFound(err error) bool { return errors.Is(err, openchoreo.ErrNotFound) }
