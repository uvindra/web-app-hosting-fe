package webapp

import (
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func deployInput(env, build string) DeployBuildInput {
	in := DeployBuildInput{Environment: env}
	in.Build.ID = build
	return in
}

// TestConcurrentDeploysCutTheirOwnImage: two builds of one track deployed at
// once must each get a release holding their own image, even when
// OpenChoreo's snapshot lags the workload write.
func TestConcurrentDeploysCutTheirOwnImage(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	now := time.Now()
	e.addRun("run-a", "site", "img-a", BuildSuccess, now.Add(-time.Minute), nil)
	e.addRun("run-b", "site", "img-b", BuildSuccess, now, nil)
	e.oc.Put("workloads", map[string]any{
		"metadata": map[string]any{"name": "site-workload"},
		"spec":     map[string]any{"owner": map[string]any{"componentName": "site", "projectName": "default"}, "container": map[string]any{"image": "img-0"}},
	})
	e.oc.beforeGenerate = func(string, string) { time.Sleep(50 * time.Millisecond) }

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, run := range []string{"run-a", "run-b"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = e.svc.Deploy(e.ctx, "site", "site", deployInput("development", run))
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("deploy %d: %v", i, err)
		}
	}
	if a, b := e.releaseImage("run-a"), e.releaseImage("run-b"); a != "img-a" || b != "img-b" {
		t.Fatalf("release images: run-a=%q run-b=%q", a, b)
	}
	// Serialized: no snapshot ever had to be thrown away and re-cut.
	if len(e.oc.deletes) != 0 {
		t.Fatalf("deploys interleaved; re-cut releases: %v", e.oc.deletes)
	}
}

// TestMismatchedSnapshotIsRecut: when another writer changes the workload
// between our write and the snapshot, the bad release is deleted and re-cut.
func TestMismatchedSnapshotIsRecut(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addRun("run-a", "site", "img-a", BuildSuccess, time.Now(), nil)
	var calls atomic.Int32
	e.oc.beforeGenerate = func(component, _ string) {
		if calls.Add(1) > 1 {
			return
		}
		for _, w := range e.oc.List("workloads") {
			w["spec"].(map[string]any)["container"].(map[string]any)["image"] = "intruder"
			e.oc.Put("workloads", w)
		}
	}
	if _, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("development", "run-a")); err != nil {
		t.Fatal(err)
	}
	if got := e.releaseImage("run-a"); got != "img-a" {
		t.Fatalf("release image = %q", got)
	}
	if calls.Load() != 2 || !slices.Contains(e.oc.deletes, "componentreleases/run-a") {
		t.Fatalf("generate calls = %d, deletes = %v", calls.Load(), e.oc.deletes)
	}
}

// TestExistingReleaseImageIsChecked: an existing release named after the
// build is reused only when it holds the build's image.
func TestExistingReleaseImageIsChecked(t *testing.T) {
	stale := func(e *testEnv) {
		e.oc.Put("componentreleases", map[string]any{
			"metadata": map[string]any{"name": "run-a"},
			"spec":     map[string]any{"owner": map[string]any{"componentName": "site", "projectName": "default"}, "componentType": map[string]any{}, "workload": map[string]any{"container": map[string]any{"image": "img-other"}}},
		})
	}
	t.Run("unbound is re-cut", func(t *testing.T) {
		e := newTestEnv(t)
		e.addTrack("site", "site", "main", true)
		e.addRun("run-a", "site", "img-a", BuildSuccess, time.Now(), nil)
		stale(e)
		if _, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("development", "run-a")); err != nil {
			t.Fatal(err)
		}
		if got := e.releaseImage("run-a"); got != "img-a" {
			t.Fatalf("release image = %q", got)
		}
	})
	t.Run("bound fails loudly", func(t *testing.T) {
		e := newTestEnv(t)
		e.addTrack("site", "site", "main", true)
		e.addRun("run-a", "site", "img-a", BuildSuccess, time.Now(), nil)
		stale(e)
		e.oc.Put("releasebindings", map[string]any{
			"metadata": map[string]any{"name": "site-production"},
			"spec":     map[string]any{"environment": "production", "releaseName": "run-a", "owner": map[string]any{"componentName": "site", "projectName": "default"}},
		})
		_, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("development", "run-a"))
		if de, ok := AsError(err); !ok || de.Code != CodeConflict {
			t.Fatalf("err = %v", err)
		}
		if got := e.releaseImage("run-a"); got != "img-other" {
			t.Fatalf("bound release was touched: %q", got)
		}
	})
	t.Run("matching is reused", func(t *testing.T) {
		e := newTestEnv(t)
		e.addTrack("site", "site", "main", true)
		e.addRun("run-a", "site", "img-other", BuildSuccess, time.Now(), nil)
		stale(e)
		if _, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("development", "run-a")); err != nil {
			t.Fatal(err)
		}
		if len(e.oc.deletes) != 0 {
			t.Fatalf("deletes = %v", e.oc.deletes)
		}
	})
}
