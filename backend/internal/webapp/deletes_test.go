package webapp

import (
	"slices"
	"strings"
	"testing"
	"time"
)

func TestDeleteWebApp(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addTrack("site--b1", "site", "b1", false)
	e.addTrack("other", "other", "main", true)
	e.addStoppedBindingWithSecret("site", "development", "ref-main")
	e.addStoppedBindingWithSecret("site--b1", "development", "ref-b1")
	e.addStoppedBindingWithSecret("other", "development", "ref-other")
	// A held track lock (an in-flight deploy) delays the delete.
	unlock, err := e.svc.lockTrack(e.ctx, "site")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- e.svc.DeleteWebApp(e.ctx, "default", "site") }()
	select {
	case err := <-done:
		t.Fatalf("delete did not wait for the track lock: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	unlock()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	for _, c := range []string{"site", "site--b1"} {
		if e.oc.Get("components", c) != nil || e.oc.Get("releasebindings", c+"-development") != nil {
			t.Fatalf("%s not purged", c)
		}
		if _, ok := e.svc.trackLocks.Load(testNS + "/" + c); ok {
			t.Fatalf("%s lock entry kept", c)
		}
	}
	if e.oc.Get("components", "other") == nil || e.oc.Get("releasebindings", "other-development") == nil {
		t.Fatal("another web app was touched")
	}
	slices.Sort(e.secrets.deleted)
	if want := []string{"ref-b1", "ref-main"}; !slices.Equal(e.secrets.deleted, want) {
		t.Fatalf("deleted secrets = %v", e.secrets.deleted)
	}
	// The default track goes last.
	var comps []string
	for _, d := range e.oc.deletes {
		if c, ok := strings.CutPrefix(d, "components/"); ok {
			comps = append(comps, c)
		}
	}
	if !slices.Equal(comps, []string{"site--b1", "site"}) {
		t.Fatalf("component delete order = %v", comps)
	}
	// Second delete: nothing left.
	if err := e.svc.DeleteWebApp(e.ctx, "default", "site"); !isCode(err, CodeNotFound) {
		t.Fatalf("second delete = %v, want NOT_FOUND", err)
	}
}

func TestDeleteWebAppHalfDeletedAndWrongProject(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addTrack("site--b1", "site", "b1", false)
	if err := e.svc.DeleteWebApp(e.ctx, "elsewhere", "site"); !isCode(err, CodeNotFound) {
		t.Fatalf("wrong project = %v, want NOT_FOUND", err)
	}
	// OC is still finalizing the default track; the branch track is live.
	c := e.oc.Get("components", "site")
	c["metadata"].(map[string]any)["deletionTimestamp"] = time.Now().UTC().Format(time.RFC3339)
	e.oc.Put("components", c)
	if err := e.svc.DeleteWebApp(e.ctx, "default", "site"); err != nil {
		t.Fatal(err)
	}
	if e.oc.Get("components", "site") == nil {
		t.Fatal("the finalizing track should be left to OpenChoreo")
	}
	if e.oc.Get("components", "site--b1") != nil {
		t.Fatal("live track not deleted")
	}
	// Only the finalizing track is left: 204.
	if err := e.svc.DeleteWebApp(e.ctx, "default", "site"); err != nil {
		t.Fatalf("delete while finalizing = %v", err)
	}
}

func TestDeleteProject(t *testing.T) {
	e := newTestEnv(t)
	if err := e.svc.DeleteProject(e.ctx, "default"); !isCode(err, CodeDefaultProject) {
		t.Fatalf("delete default = %v, want DEFAULT_PROJECT", err)
	}
	e.oc.Put("projects", obj("p1", nil))
	// A component of another product (no web-app labels) blocks the delete.
	e.oc.Put("components", map[string]any{
		"metadata": map[string]any{"name": "integration"},
		"spec":     map[string]any{"owner": map[string]any{"projectName": "p1"}},
	})
	err := e.svc.DeleteProject(e.ctx, "p1")
	if !isCode(err, CodeProjectNotEmpty) {
		t.Fatalf("non-empty = %v, want PROJECT_NOT_EMPTY", err)
	}
	if ae, _ := AsError(err); ae.Details["componentCount"] != 1 {
		t.Fatalf("details = %v", ae.Details)
	}
	p, err := e.svc.GetProject(e.ctx, "p1")
	if err != nil || p.ComponentCount == nil || *p.ComponentCount != 1 || p.IsDefault {
		t.Fatalf("project = %+v, %v", p, err)
	}
	e.oc.mu.Lock()
	delete(e.oc.objs["components"], "integration")
	e.oc.mu.Unlock()
	if err := e.svc.DeleteProject(e.ctx, "p1"); err != nil {
		t.Fatal(err)
	}
	if e.oc.Get("projects", "p1") != nil {
		t.Fatal("project not deleted")
	}
	if err := e.svc.DeleteProject(e.ctx, "p1"); !isCode(err, CodeNotFound) {
		t.Fatalf("second delete = %v, want NOT_FOUND", err)
	}
}

// TestListProjectsHidesDeleting: a project OC is still finalizing isn't listed.
func TestListProjectsHidesDeleting(t *testing.T) {
	e := newTestEnv(t)
	e.oc.Put("projects", obj("p1", nil))
	e.oc.Put("projects", map[string]any{"metadata": map[string]any{"name": "p2", "deletionTimestamp": "2026-10-12T06:55:40Z"}})
	ps, err := e.svc.ListProjects(e.ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range ps {
		if p.ID == "p2" {
			t.Fatalf("deleting project listed: %+v", ps)
		}
	}
	if !slices.ContainsFunc(ps, func(p Project) bool { return p.ID == "p1" }) {
		t.Fatalf("live project missing: %+v", ps)
	}
}

func isCode(err error, c Code) bool {
	e, ok := AsError(err)
	return ok && e.Code == c
}
