package webapp

import (
	"context"
	"errors"
	"sort"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

const webAppSelector = LabelWebApp // label-exists selector

// ListProjects lists the org's projects. On first login (no projects at all)
// it creates the default project, as ICP does.
func (s *Service) ListProjects(ctx context.Context) ([]Project, error) {
	n := ns(ctx)
	projects, err := s.oc.ListProjects(ctx, n)
	if err != nil {
		return nil, err
	}
	if len(projects) == 0 && s.opts.DefaultProject != "" {
		p, err := s.createProject(ctx, CreateProjectInput{Name: "Default Project", Handler: s.opts.DefaultProject})
		if err != nil && !errors.Is(err, openchoreo.ErrConflict) {
			return nil, err
		}
		if p != nil {
			projects = append(projects, *p)
		}
	}
	counts, err := s.webAppCounts(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Project, 0, len(projects))
	for _, p := range projects {
		out = append(out, toProject(p, counts[p.Metadata.Name]))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt > out[j].UpdatedAt })
	return out, nil
}

// GetProject returns one project.
func (s *Service) GetProject(ctx context.Context, id string) (*Project, error) {
	p, err := s.oc.GetProject(ctx, ns(ctx), id)
	if err != nil {
		if notFound(err) {
			return nil, errf(CodeNotFound, "project %q not found", id)
		}
		return nil, err
	}
	counts, err := s.webAppCounts(ctx)
	if err != nil {
		return nil, err
	}
	out := toProject(*p, counts[id])
	return &out, nil
}

// CreateProject creates a project on the namespace's default pipeline.
func (s *Service) CreateProject(ctx context.Context, in CreateProjectInput) (*Project, error) {
	if !ValidHandle(in.Handler) {
		return nil, errf(CodeBadRequest, "invalid project handle %q: use lowercase letters, numbers and hyphens", in.Handler)
	}
	p, err := s.createProject(ctx, in)
	if err != nil {
		if errors.Is(err, openchoreo.ErrConflict) {
			return nil, errf(CodeConflict, "a project named %q already exists", in.Handler)
		}
		return nil, err
	}
	out := toProject(*p, 0)
	return &out, nil
}

func (s *Service) createProject(ctx context.Context, in CreateProjectInput) (*gen.Project, error) {
	ann := map[string]string{ocDisplayName: in.Name}
	if in.Description != "" {
		ann[ocDescription] = in.Description
	}
	spec := &gen.ProjectSpec{}
	spec.DeploymentPipelineRef = &struct {
		Kind *gen.ProjectSpecDeploymentPipelineRefKind `json:"kind,omitempty"`
		Name string                                    `json:"name"`
	}{Name: "default"}
	return s.oc.CreateProject(ctx, ns(ctx), gen.Project{
		Metadata: gen.ObjectMeta{Name: in.Handler, Annotations: &ann},
		Spec:     spec,
	})
}

// webAppCounts counts distinct web apps per project.
func (s *Service) webAppCounts(ctx context.Context) (map[string]int, error) {
	comps, err := s.oc.ListComponents(ctx, ns(ctx), "", webAppSelector)
	if err != nil {
		return nil, err
	}
	seen := map[string]map[string]bool{}
	for _, c := range comps {
		if c.Spec == nil {
			continue
		}
		p := c.Spec.Owner.ProjectName
		if seen[p] == nil {
			seen[p] = map[string]bool{}
		}
		seen[p][label(c.Metadata, LabelWebApp)] = true
	}
	out := map[string]int{}
	for p, apps := range seen {
		out[p] = len(apps)
	}
	return out, nil
}

func toProject(p gen.Project, webApps int) Project {
	name := annotation(p.Metadata, ocDisplayName)
	if name == "" {
		name = p.Metadata.Name
	}
	return Project{
		ID: p.Metadata.Name, Handler: p.Metadata.Name, Name: name,
		Description: annotation(p.Metadata, ocDescription),
		UpdatedAt:   ts(p.Metadata.CreationTimestamp), ActiveWebAppCount: webApps, Status: "active",
	}
}
