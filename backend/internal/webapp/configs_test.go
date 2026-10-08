package webapp

import (
	"testing"
)

func (e *testEnv) addBinding(component, env, release string) {
	e.oc.Put("releasebindings", map[string]any{
		"metadata": map[string]any{"name": component + "-" + env},
		"spec":     map[string]any{"environment": env, "releaseName": release, "owner": map[string]any{"componentName": component, "projectName": "default"}},
	})
}

func fileWrite(name, file, mount, value string) ConfigWrite {
	return ConfigWrite{Name: name, Kind: KindFile, MountPath: mount, Entries: []ConfigEntry{{Key: file, Value: value}}}
}

// TestFileConfigConflicts: a file config cannot mount a file another file
// config already mounts at the same path (on create or update).
func TestFileConfigConflicts(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addBinding("site", "development", "r1")
	if _, err := e.svc.CreateConfig(e.ctx, "site", "site", "development", fileWrite("a", "config.js", "", "a")); err != nil {
		t.Fatal(err)
	}
	_, err := e.svc.CreateConfig(e.ctx, "site", "site", "development", fileWrite("b", "config.js", "/usr/share/nginx/html/", "b"))
	if ce, ok := AsError(err); !ok || ce.Code != CodeConflict {
		t.Fatalf("duplicate file: %v", err)
	}
	if _, err := e.svc.CreateConfig(e.ctx, "site", "site", "development", fileWrite("b", "config.js", "/etc/app", "b")); err != nil {
		t.Fatalf("same name, other dir: %v", err)
	}
	if _, err := e.svc.UpdateConfig(e.ctx, "site", "site", "development", "a", fileWrite("a", "config.js", "", "a2")); err != nil {
		t.Fatalf("update in place: %v", err)
	}
	_, err = e.svc.UpdateConfig(e.ctx, "site", "site", "development", "b", fileWrite("b", "config.js", "", "b"))
	if ce, ok := AsError(err); !ok || ce.Code != CodeConflict {
		t.Fatalf("update onto a's file: %v", err)
	}
	if err := e.svc.DeleteConfig(e.ctx, "site", "site", "development", "b"); err != nil {
		t.Fatal(err)
	}
	items, err := e.svc.Configs(e.ctx, "site", "site", "development")
	if err != nil || len(items) != 1 || items[0].Entries[0].Value != "a2" {
		t.Fatalf("items = %+v, %v", items, err)
	}
}
