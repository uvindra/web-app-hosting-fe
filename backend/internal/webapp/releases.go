package webapp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"slices"
	"strconv"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

// A ComponentRelease freezes the ComponentType spec, the traits and the
// component profile at the time it is cut, so a binding whose release
// predates CT v3 ignores the v3 environment configs (probes) and the HPA
// trait's config. The first P1 write to such a binding re-cuts its release —
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

// attachTraitsToTracks attaches the HPA trait to every web-app track
// Component in the namespace that lacks it (CT upgrade to v3). Best effort:
// a failure is logged, and the trait is attached again lazily before a P1
// setting is written.
func (s *Service) attachTraitsToTracks(ctx context.Context) {
	comps, err := s.oc.ListComponents(ctx, ns(ctx), "", LabelProduct+"="+ProductName)
	if err != nil {
		slog.WarnContext(ctx, "could not list track components to attach the HPA trait", "error", err)
		return
	}
	for _, c := range comps {
		if deleting(c) || c.Spec == nil || c.Spec.ComponentType.Name != platformres.ComponentTypeRef || label(c.Metadata, LabelWebApp) == "" {
			continue
		}
		if err := s.ensureTrackTrait(ctx, trackOf(c)); err != nil {
			slog.WarnContext(ctx, "could not attach the HPA trait", "component", c.Metadata.Name, "error", err)
		}
	}
}

// applyP1Binding writes a P1 setting (health checks, autoscaling) to the
// track's binding in env. Under the track's deploy lock it first makes sure
// the bound release supports P1 settings — re-cutting it when it predates CT
// v3 — and binds that release in the same write.
func (s *Service) applyP1Binding(ctx context.Context, t track, env string, mutate func(*gen.ReleaseBindingSpec)) (*gen.ReleaseBinding, error) {
	if err := s.EnsurePlatformResources(ctx); err != nil {
		return nil, err
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
	rel, err := s.currentReleaseLocked(ctx, t, releaseOf(*cur))
	if err != nil {
		return nil, err
	}
	return s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		spec.ReleaseName = &rel
		mutate(spec)
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
