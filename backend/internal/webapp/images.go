package webapp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// SourceDocker is the source type of web apps created from a container image
// (ICP's "deploy-prebuilt"): a track Component with no build workflow whose
// Workload holds the image. Public images only in P1.
const SourceDocker = "docker"

// Image annotations on an image-sourced track Component.
const (
	AnnImage    = annPrefix + "image"
	AnnImageTag = annPrefix + "image-tag"
)

// ImageSource is an image-sourced track's current image (Build page).
type ImageSource struct {
	Image string `json:"image"`
	Tag   string `json:"tag"`
	Port  int    `json:"port"`
}

// DeployImageInput deploys another tag of the track's image.
type DeployImageInput struct {
	Tag string `json:"tag"`
}

var (
	// imageRE: [registry[:port]/]path[/path...] in lowercase (no tag/digest).
	imageRE = regexp.MustCompile(`^([a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?/)?[a-z0-9]+([._-][a-z0-9]+)*(/[a-z0-9]+([._-][a-z0-9]+)*)*$`)
	tagRE   = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$`)
)

// ImageRef validates an image name and tag and returns `<image>:<tag>`.
func ImageRef(image, tag string) (string, error) {
	image, tag = strings.TrimSpace(image), strings.TrimSpace(tag)
	if tag == "" {
		tag = "latest"
	}
	if !imageRE.MatchString(image) || len(image) > 255 {
		return "", errf(CodeBadRequest, "invalid image name %q: use e.g. nginxinc/nginx-unprivileged or ghcr.io/owner/app (without a tag)", image)
	}
	if !tagRE.MatchString(tag) {
		return "", errf(CodeBadRequest, "invalid image tag %q", tag)
	}
	return image + ":" + tag, nil
}

func (t track) isImage() bool { return t.SourceType == SourceDocker }

// createImageWebApp creates an image-sourced web app: its Component (no
// workflow), its Workload (image + external HTTP endpoint), then deploys it
// to the first environment.
func (s *Service) createImageWebApp(ctx context.Context, projectID string, in CreateWebAppInput) (*WebApp, error) {
	if !ValidNewWebAppHandle(in.Handler) {
		return nil, errf(CodeBadRequest, "invalid web app name %q: use lowercase letters, numbers and single hyphens (max %d)", in.Handler, maxHandle)
	}
	ref, err := ImageRef(in.Image, in.Tag)
	if err != nil {
		return nil, err
	}
	if in.Port < 1 || in.Port > 65535 {
		return nil, errf(CodeBadRequest, "invalid port %d", in.Port)
	}
	tag := strings.TrimPrefix(ref, strings.TrimSpace(in.Image)+":")
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
		WebApp: in.Handler, Branch: "", IsDefault: true, Port: in.Port, SourceType: SourceDocker,
		DisplayName: strings.TrimSpace(in.DisplayName), Description: strings.TrimSpace(in.Description),
		Image: strings.TrimSpace(in.Image), ImageTag: tag,
	})
	if err != nil {
		return nil, err
	}
	t := trackOf(*comp)
	vis := []gen.WorkloadEndpointVisibility{gen.WorkloadEndpointVisibilityExternal}
	wl := gen.Workload{Metadata: gen.ObjectMeta{Name: t.Name + "-workload"}, Spec: &gen.WorkloadSpec{
		Container: &gen.WorkloadContainer{Image: ref},
		Endpoints: &map[string]gen.WorkloadEndpoint{"http": {Port: in.Port, Type: gen.WorkloadEndpointTypeHTTP, Visibility: &vis}},
	}}
	wl.Spec.Owner = &struct {
		ComponentName string `json:"componentName"`
		ProjectName   string `json:"projectName"`
	}{ComponentName: t.Name, ProjectName: projectID}
	if _, err := s.oc.CreateWorkload(ctx, ns(ctx), wl); err != nil {
		return nil, fmt.Errorf("web app created but creating its workload failed: %w", err)
	}
	envs, err := s.pipelineEnvironments(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if len(envs) > 0 {
		if _, err := s.deployImage(ctx, t, envs[0].ID, ref); err != nil {
			return nil, fmt.Errorf("web app created but the first deploy failed: %w", err)
		}
	}
	w := s.toWebApp([]track{t}, nil, nil, nil)
	return &w, nil
}

// ImageSource returns an image-sourced track's image.
func (s *Service) ImageSource(ctx context.Context, webAppID, trackID string) (*ImageSource, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	if !t.isImage() {
		return nil, errf(CodeNotFound, "deployment track %q is not image-sourced", trackID)
	}
	return &ImageSource{Image: annotation(t.comp.Metadata, AnnImage), Tag: annotation(t.comp.Metadata, AnnImageTag), Port: t.Port}, nil
}

// DeployImageTag deploys another tag of the track's image to the first
// environment (promote it from there as usual).
func (s *Service) DeployImageTag(ctx context.Context, webAppID, trackID string, in DeployImageInput) (*Deployment, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	if !t.isImage() {
		return nil, errf(CodeNotSupported, "deployment track %q builds from source; deploy a build instead", trackID)
	}
	image := annotation(t.comp.Metadata, AnnImage)
	ref, err := ImageRef(image, in.Tag)
	if err != nil {
		return nil, err
	}
	envs, err := s.pipelineEnvironments(ctx, t.Project)
	if err != nil {
		return nil, err
	}
	if len(envs) == 0 {
		return nil, errf(CodeConflict, "the project has no environments")
	}
	d, err := s.deployImage(ctx, *t, envs[0].ID, ref)
	if err != nil {
		return nil, err
	}
	tag := strings.TrimPrefix(ref, image+":")
	if _, err := s.oc.MutateComponent(ctx, ns(ctx), t.Name, func(c *gen.Component) { setAnnotation(&c.Metadata, AnnImageTag, tag) }); err != nil {
		return nil, fmt.Errorf("deployed, but recording the tag failed: %w", err)
	}
	return d, nil
}

// deployImage writes ref onto the track's Workload, cuts a release from it
// and binds it in env — under the track's deploy lock, with the release's
// image verified like a build deploy.
func (s *Service) deployImage(ctx context.Context, t track, env, ref string) (*Deployment, error) {
	unlock, err := s.lockTrack(ctx, t.Name)
	if err != nil {
		return nil, err
	}
	defer unlock()
	s.prepareForDeploy(ctx, t)
	n := ns(ctx)
	cur, err := s.oc.GetComponentWorkload(ctx, n, t.Name)
	if err != nil {
		return nil, err
	}
	if cur == nil || cur.Spec == nil || cur.Spec.Container == nil {
		return nil, errf(CodeConflict, "track %q has no workload", t.Name)
	}
	if cur.Spec.Container.Image != ref {
		cur.Spec.Container.Image = ref
		if err := s.oc.UpdateWorkload(ctx, n, *cur); err != nil {
			return nil, fmt.Errorf("update workload: %w", err)
		}
	}
	rel := imageReleaseName(t.Name)
	if err := s.oc.GenerateRelease(ctx, n, t.Name, rel); err != nil {
		return nil, fmt.Errorf("cut release: %w", err)
	}
	r, err := s.oc.GetComponentRelease(ctx, n, rel)
	if err != nil {
		return nil, fmt.Errorf("read back release %q: %w", rel, err)
	}
	if got := releaseImage(r); got != ref {
		_ = s.oc.DeleteComponentRelease(ctx, n, rel)
		return nil, errf(CodeConflict, "release %q holds image %s, not %s (another deploy may be running) — try again", rel, got, ref)
	}
	d, err := s.bindRelease(ctx, t, env, rel, gen.WorkflowRun{})
	if err != nil {
		return nil, err
	}
	d.Image = ref
	return d, nil
}

// imageReleaseName names an image deploy's release: `<component>-img-<time>-<rand>`.
func imageReleaseName(component string) string {
	var r [2]byte
	_, _ = rand.Read(r[:])
	base := component
	if len(base) > 40 {
		base = base[:40]
	}
	return fmt.Sprintf("%s-img-%s-%s", strings.TrimRight(base, "-"), time.Now().UTC().Format("060102150405"), hex.EncodeToString(r[:]))
}
