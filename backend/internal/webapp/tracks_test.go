package webapp

import (
	"slices"
	"testing"
)

func (e *testEnv) addStoppedBindingWithSecret(component, env, ref string) {
	e.oc.Put("releasebindings", map[string]any{
		"metadata": map[string]any{"name": component + "-" + env, "annotations": map[string]any{
			AnnConfigs: `[{"id":"s","name":"s","kind":"secret","keys":["K"],"secretRef":"` + ref + `"},{"id":"c","name":"c","kind":"config","keys":["A"]}]`,
		}},
		"spec": map[string]any{"environment": env, "releaseName": "r1", "state": "Undeploy", "owner": map[string]any{"componentName": component, "projectName": "default"}},
	})
}

// TestDeleteTrackDeletesSecrets: deleting a track removes the secret-store
// entries of every environment's secret configs; a failing store is
// reported but does not block the delete.
func TestDeleteTrackDeletesSecrets(t *testing.T) {
	for _, fail := range []bool{false, true} {
		e := newTestEnv(t)
		e.secrets.fail = fail
		e.addTrack("site", "site", "main", true)
		e.addTrack("site-b1", "site", "b1", false)
		e.addStoppedBindingWithSecret("site-b1", "development", "ref-dev")
		e.addStoppedBindingWithSecret("site-b1", "production", "ref-prod")
		if err := e.svc.DeleteTrack(e.ctx, "site", "site-b1"); err != nil {
			t.Fatalf("fail=%v: %v", fail, err)
		}
		if e.oc.Get("components", "site-b1") != nil || len(e.oc.List("releasebindings")) != 0 {
			t.Fatalf("fail=%v: track not deleted", fail)
		}
		slices.Sort(e.secrets.deleted)
		if want := []string{"ref-dev", "ref-prod"}; !fail && !slices.Equal(e.secrets.deleted, want) {
			t.Fatalf("deleted secrets = %v", e.secrets.deleted)
		}
	}
}
