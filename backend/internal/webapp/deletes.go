package webapp

import (
	"context"
	"sort"
)

// DeleteWebApp deletes a web app: every track Component labelled for it
// (non-default tracks first, the default last so a partial failure leaves a
// listable app), each under its track lock so it cannot interleave with a
// deploy, with purgeTrackLocked's cleanup. Deployed environments are
// undeployed by the binding deletes. Idempotent: tracks OpenChoreo is already
// deleting are skipped (204 while it finishes), and a web app with no
// Components left is NOT_FOUND. Each deleted Component frees its quota slot
// (D7: quota counts track Components).
func (s *Service) DeleteWebApp(ctx context.Context, projectID, webAppID string) error {
	if !ValidHandle(webAppID) {
		return errf(CodeNotFound, "web app %q not found", webAppID)
	}
	comps, err := s.oc.ListComponents(ctx, ns(ctx), "", LabelWebApp+"="+webAppID)
	if err != nil {
		return err
	}
	if len(comps) == 0 {
		return errf(CodeNotFound, "web app %q not found", webAppID)
	}
	var tracks []track
	for _, c := range comps {
		t := trackOf(c)
		if t.Project != projectID {
			return errf(CodeNotFound, "web app %q not found in project %q", webAppID, projectID)
		}
		if !deleting(c) {
			tracks = append(tracks, t)
		}
	}
	sort.SliceStable(tracks, func(i, j int) bool { return !tracks[i].IsDefault && tracks[j].IsDefault })
	for _, t := range tracks {
		if err := s.purgeTrack(ctx, t.Name); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) purgeTrack(ctx context.Context, trackID string) error {
	unlock, err := s.lockTrack(ctx, trackID)
	if err != nil {
		return err
	}
	defer unlock()
	return s.purgeTrackLocked(ctx, trackID)
}

// isDefaultProject reports whether id is the org's default project, which is
// never deleted (it is recreated on the next login anyway).
func (s *Service) isDefaultProject(id string) bool {
	return id == s.opts.DefaultProject || id == "default"
}

// projectComponentCount counts a project's live Components of every product
// (projects are shared across WSO2 Cloud products, e.g. ICP integrations).
func (s *Service) projectComponentCount(ctx context.Context, projectID string) (int, error) {
	comps, err := s.oc.ListComponents(ctx, ns(ctx), projectID, "")
	if err != nil {
		return 0, err
	}
	n := 0
	for _, c := range comps {
		if !deleting(c) {
			n++
		}
	}
	return n, nil
}

// DeleteProject deletes an empty, non-default project. Projects are shared
// across products, and OpenChoreo's project-cleanup finalizer would delete
// whatever the project still owns, so any live Component (of any product)
// blocks the delete with PROJECT_NOT_EMPTY. The BFF creates nothing else per
// project. Idempotent: a project already being deleted answers 204, a
// missing one NOT_FOUND.
func (s *Service) DeleteProject(ctx context.Context, projectID string) error {
	if s.isDefaultProject(projectID) {
		return errf(CodeDefaultProject, "the default project cannot be deleted")
	}
	p, err := s.getProject(ctx, projectID)
	if err != nil {
		return err
	}
	if p.Metadata.DeletionTimestamp != nil {
		return nil
	}
	count, err := s.projectComponentCount(ctx, projectID)
	if err != nil {
		return err
	}
	if count > 0 {
		e := errf(CodeProjectNotEmpty, "the project still has %d component(s); delete them first", count).(*Error)
		e.Details = map[string]any{"componentCount": count}
		return e
	}
	return s.oc.DeleteProject(ctx, ns(ctx), projectID)
}
