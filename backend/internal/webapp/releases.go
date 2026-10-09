package webapp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"slices"
	"strconv"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

// A ComponentRelease freezes the ComponentType spec, the traits and the
// component profile at the time it is cut, so a binding whose release
// predates CT v3 ignores the v3 environment configs (probes) and the HPA
// trait's config. The first settings write to such a binding re-cuts its release —
// the same frozen workload, the current ComponentType and traits — under
// `<release>--r<version>`; refreshedSuffix maps it back to its build.
var refreshedSuffix = regexp.MustCompile(`--r[0-9]+$`)

// buildOfRelease returns the build (WorkflowRun) a release was cut from: the
// release name without a refresh suffix. Image releases have no build.
func buildOfRelease(release string) string {
	return refreshedSuffix.ReplaceAllString(release, "")
}

// releaseIsCurrent reports whether a release was cut with a ComponentType and
// traits that support the P1 settings (probe passthrough + HPA trait).
func releaseIsCurrent(r *gen.ComponentRelease) bool {
	if r == nil || r.Spec == nil {
		return false
	}
	props, _ := nested(r.Spec.ComponentType, "spec", "environmentConfigs", "openAPIV3Schema", "properties").(map[string]any)
	if _, ok := props["livenessProbe"]; !ok {
		return false
	}
	if r.Spec.ComponentProfile == nil || r.Spec.ComponentProfile.Traits == nil {
		return false
	}
	return slices.ContainsFunc(*r.Spec.ComponentProfile.Traits, isHPATrait)
}

func isHPATrait(t gen.ComponentTrait) bool {
	return t.InstanceName == platformres.HPATraitInstance && t.Name == platformres.HPATraitName
}

// hpaTrait is the trait attachment every track Component carries.
func hpaTrait() gen.ComponentTrait {
	kind := gen.ComponentTraitKind("Trait")
	return gen.ComponentTrait{Kind: &kind, Name: platformres.HPATraitName, InstanceName: platformres.HPATraitInstance}
}

// withHPATrait adds the HPA trait to a Component spec when it lacks it, and
// reports whether it changed.
func withHPATrait(spec *gen.ComponentSpec) bool {
	if spec == nil {
		return false
	}
	traits := []gen.ComponentTrait{}
	if spec.Traits != nil {
		traits = *spec.Traits
	}
	if slices.ContainsFunc(traits, isHPATrait) {
		return false
	}
	traits = append(traits, hpaTrait())
	spec.Traits = &traits
	return true
}

// ensureTrackTrait attaches the HPA trait to a track Component created
// before CT v3.
func (s *Service) ensureTrackTrait(ctx context.Context, t track) error {
	if t.comp.Spec != nil && t.comp.Spec.Traits != nil && slices.ContainsFunc(*t.comp.Spec.Traits, isHPATrait) {
		return nil
	}
	_, err := s.oc.MutateComponent(ctx, ns(ctx), t.Name, func(c *gen.Component) { withHPATrait(c.Spec) })
	return err
}

// onSharedWorkflow reports whether a Component spec still builds with a
// shared ClusterWorkflow (created before v4) that has a scanning copy.
func onSharedWorkflow(spec *gen.ComponentSpec) bool {
	if spec == nil || spec.Workflow == nil || spec.Workflow.Kind == nil {
		return false
	}
	_, ok := platformres.ScannedWorkflow(string(*spec.Workflow.Kind), spec.Workflow.Name)
	return ok
}

// withScannedWorkflow points a Component spec still on a shared
// ClusterWorkflow at our security-scanning copy (D15).
func withScannedWorkflow(spec *gen.ComponentSpec) {
	if !onSharedWorkflow(spec) {
		return
	}
	name, _ := platformres.ScannedWorkflow(string(*spec.Workflow.Kind), spec.Workflow.Name)
	kind := gen.ComponentWorkflowConfigKindWorkflow
	spec.Workflow.Kind, spec.Workflow.Name = &kind, name
}

// ensureTrackWorkflow migrates a track Component off a shared ClusterWorkflow
// onto our scanning copy, so OpenChoreo-triggered builds (auto-build) scan
// too. The namespaced workflow must already exist (EnsurePlatformResources).
func (s *Service) ensureTrackWorkflow(ctx context.Context, t track) error {
	if !onSharedWorkflow(t.comp.Spec) {
		return nil
	}
	_, err := s.oc.MutateComponent(ctx, ns(ctx), t.Name, func(c *gen.Component) { withScannedWorkflow(c.Spec) })
	return err
}

// Bounds of the background HPA-trait attach pass.
const (
	attachTraitsTimeout     = 5 * time.Minute
	attachTraitsConcurrency = 4
)

// attachTraitsInBackground starts attachTraitsToTracks for the request's
// namespace once per process per platformres.Version, detached from the
// request (its own timeout, service identity) so the first request after a
// rollout doesn't wait on every track Component being updated.
func (s *Service) attachTraitsInBackground(ctx context.Context) {
	key := ns(ctx) + "@" + strconv.Itoa(platformres.Version)
	if _, started := s.traitPasses.LoadOrStore(key, struct{}{}); started {
		return
	}
	bctx := auth.Detached(ctx)
	s.async.Add(1)
	go func() {
		defer s.async.Done()
		ctx, cancel := context.WithTimeout(bctx, attachTraitsTimeout)
		defer cancel()
		s.attachTraitsToTracks(ctx)
	}()
}

// attachTraitsToTracks attaches the HPA trait to every web-app track
// Component in the namespace that lacks it (CT upgrade to v3), a few at a
// time. Best effort: failures are logged, and the trait is attached again
// lazily (ensureTrackTrait) before a release is re-cut.
func (s *Service) attachTraitsToTracks(ctx context.Context) {
	comps, err := s.oc.ListComponents(ctx, ns(ctx), "", LabelProduct+"="+ProductName)
	if err != nil {
		slog.WarnContext(ctx, "could not list track components to attach the HPA trait", "error", err)
		return
	}
	var g errgroup.Group
	g.SetLimit(attachTraitsConcurrency)
	for _, c := range comps {
		if deleting(c) || c.Spec == nil || c.Spec.ComponentType.Name != platformres.ComponentTypeRef || label(c.Metadata, LabelWebApp) == "" {
			continue
		}
		g.Go(func() error {
			if err := s.ensureTrackTrait(ctx, trackOf(c)); err != nil {
				slog.WarnContext(ctx, "could not attach the HPA trait", "component", c.Metadata.Name, "error", err)
			}
			if err := s.ensureTrackWorkflow(ctx, trackOf(c)); err != nil {
				slog.WarnContext(ctx, "could not move the component to the scanning build workflow", "component", c.Metadata.Name, "error", err)
			}
			return nil
		})
	}
	_ = g.Wait()
}

// applyBindingSettings is the single writer of an environment's settings
// (container resources, replicas, autoscaling, health checks) on the track's
// binding. Under the track's deploy lock it makes sure the bound release was
// cut with the current ComponentType and traits — re-cutting it (same frozen
// workload) when it predates CT v3 — and binds that release in the same
// write.
//
// strict settings (health checks, autoscaling) only work on a current
// release, so a failed re-cut fails the write. Other settings (resources,
// fixed replicas — CT v2 has them too) are then written onto the old release.
//
// mutate is told whether the bound release is current, i.e. carries the HPA
// trait. OpenChoreo (verified on 1.3.0) accepts traitEnvironmentConfigs for a
// trait instance the release lacks and silently ignores them, so mutate must
// not write trait configs when current is false.
func (s *Service) applyBindingSettings(ctx context.Context, t track, env string, strict bool, mutate func(spec *gen.ReleaseBindingSpec, current bool)) (*gen.ReleaseBinding, error) {
	ensureErr := s.EnsurePlatformResources(ctx)
	if ensureErr != nil && strict {
		return nil, ensureErr
	}
	unlock, err := s.lockTrack(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	defer unlock()
	cur, err := s.oc.FindBinding(ctx, ns(ctx), t.Name, env)
	if err != nil {
		return nil, err
	}
	if cur == nil || releaseOf(*cur) == "" {
		return nil, errf(CodeNotFound, "not deployed to %s", env)
	}
	rel, current := releaseOf(*cur), false
	if ensureErr == nil {
		up, err := s.currentReleaseLocked(ctx, t, rel)
		switch {
		case err == nil:
			rel, current = up, true
		case strict:
			return nil, err
		default:
			slog.WarnContext(ctx, "could not upgrade the release; writing the settings onto it as is", "track", t.Name, "release", rel, "error", err)
		}
	} else {
		slog.WarnContext(ctx, "platform resources not ensured; writing the settings onto the bound release as is", "track", t.Name, "error", ensureErr)
		r, err := s.oc.GetComponentRelease(ctx, ns(ctx), rel)
		current = err == nil && releaseIsCurrent(r)
	}
	return s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		spec.ReleaseName = &rel
		mutate(spec, current)
	})
}

// currentReleaseLocked returns release when it supports P1 settings, else the
// name of a re-cut copy (cut now if needed). Callers hold lockTrack.
func (s *Service) currentReleaseLocked(ctx context.Context, t track, release string) (string, error) {
	n := ns(ctx)
	old, err := s.oc.GetComponentRelease(ctx, n, release)
	if err != nil {
		return "", fmt.Errorf("read release %q: %w", release, err)
	}
	if releaseIsCurrent(old) {
		return release, nil
	}
	if old == nil || old.Spec == nil {
		return "", errf(CodeConflict, "release %q has no spec to upgrade", release)
	}
	want := releaseImage(old)
	name := buildOfRelease(release) + "--r" + strconv.Itoa(platformres.Version)
	if r, err := s.oc.GetComponentRelease(ctx, n, name); err == nil {
		if releaseIsCurrent(r) && releaseImage(r) == want {
			return name, nil
		}
		if err := s.oc.DeleteComponentRelease(ctx, n, name); err != nil {
			return "", err
		}
	} else if !notFound(err) {
		return "", err
	}
	if err := s.ensureTrackTrait(ctx, t); err != nil {
		return "", fmt.Errorf("attach the autoscaling trait: %w", err)
	}
	if err := s.writeFrozenWorkload(ctx, t, old); err != nil {
		return "", err
	}
	if err := s.oc.GenerateRelease(ctx, n, t.Name, name); err != nil {
		return "", fmt.Errorf("re-cut release: %w", err)
	}
	r, err := s.oc.GetComponentRelease(ctx, n, name)
	if err != nil {
		return "", fmt.Errorf("read back release %q: %w", name, err)
	}
	if got := releaseImage(r); got != want || !releaseIsCurrent(r) {
		_ = s.oc.DeleteComponentRelease(ctx, n, name)
		return "", errf(CodeConflict, "could not upgrade release %q (got image %s, want %s); another deploy may be running — try again", release, got, want)
	}
	slog.InfoContext(ctx, "re-cut release for the current ComponentType", "track", t.Name, "from", release, "to", name)
	return name, nil
}

// writeFrozenWorkload writes a release's frozen workload back onto the
// track's Workload, so GenerateRelease snapshots exactly that workload.
func (s *Service) writeFrozenWorkload(ctx context.Context, t track, rel *gen.ComponentRelease) error {
	if rel == nil || rel.Spec == nil {
		return errf(CodeConflict, "the release holds no workload")
	}
	raw, err := json.Marshal(rel.Spec.Workload)
	if err != nil {
		return err
	}
	var spec gen.WorkloadSpec
	if err := json.Unmarshal(raw, &spec); err != nil || spec.Container == nil {
		return errf(CodeConflict, "release %q holds no usable workload", rel.Metadata.Name)
	}
	cur, err := s.oc.GetComponentWorkload(ctx, ns(ctx), t.Name)
	if err != nil {
		return err
	}
	if cur == nil || cur.Spec == nil {
		return errf(CodeConflict, "track %q has no workload", t.Name)
	}
	spec.Owner = cur.Spec.Owner
	cur.Spec = &spec
	if err := s.oc.UpdateWorkload(ctx, ns(ctx), *cur); err != nil {
		return fmt.Errorf("update workload: %w", err)
	}
	return nil
}
