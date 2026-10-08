package webapp

import "testing"

// TestTrackNamesCannotCollide: a branch track's Component name is never a
// valid new web app handle (a web app's default Component name), and two
// different (web app, branch) pairs never share a track name.
func TestTrackNamesCannotCollide(t *testing.T) {
	handles := []string{"site", "site-dev", "site-dev-x", "a", "a-b", "shop"}
	branches := []string{"dev", "dev-x", "x", "b", "feature/login", "feature-login", "a--b", "Dev", "release/1.0", "-dev-", "dev--x"}
	seen := map[string]string{}
	for _, h := range handles {
		if !ValidNewWebAppHandle(h) {
			t.Fatalf("fixture handle %q invalid", h)
		}
		for _, b := range branches {
			name := TrackComponentName(h, b, false)
			if ValidNewWebAppHandle(name) {
				t.Errorf("track %q/%q = %q could be a web app name", h, b, name)
			}
			if !ValidHandle(name) || len(name) > 63 {
				t.Errorf("track name %q is not a valid resource name", name)
			}
			key := h + " " + b
			if prev, dup := seen[name]; dup {
				t.Errorf("%q and %q both map to %q", prev, key, name)
			}
			seen[name] = key
		}
	}
	for _, bad := range []string{"site--dev", "a--b"} {
		if ValidNewWebAppHandle(bad) {
			t.Errorf("%q accepted as a new web app handle", bad)
		}
	}
}
