package webapp

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

func autoState(e *testEnv, run string) string {
	r := e.oc.Get("workflowruns", run)
	a, _ := r["metadata"].(map[string]any)["annotations"].(map[string]any)
	s, _ := a[AnnAutoDeployState].(string)
	return s
}

// TestAutoDeployDeploysOnlyTheNewestBuild: concurrent ListBuilds calls with
// several finished pending builds deploy just the newest successful one,
// once; older ones are superseded, failed ones settled, running ones left.
func TestAutoDeployDeploysOnlyTheNewestBuild(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	now := time.Now()
	pending := map[string]any{AnnAutoDeployState: autoDeployPending}
	e.addRun("r1", "site", "img-1", BuildSuccess, now.Add(-4*time.Minute), pending)
	e.addRun("r2", "site", "img-2", BuildSuccess, now.Add(-3*time.Minute), pending)
	e.addRun("r3", "site", "img-3", BuildFailed, now.Add(-2*time.Minute), pending)
	e.addRun("r4", "site", "img-4", BuildInProgress, now.Add(-time.Minute), pending)
	var gens sync.Map
	e.oc.beforeGenerate = func(_, release string) {
		if _, dup := gens.LoadOrStore(release, true); dup {
			t.Errorf("release %s cut twice", release)
		}
		time.Sleep(20 * time.Millisecond)
	}

	var wg sync.WaitGroup
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := e.svc.ListBuilds(e.ctx, "site", "site"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	e.svc.WaitBackground()

	if rels := e.oc.List("componentreleases"); len(rels) != 1 || nameOf(rels[0]) != "r2" {
		t.Fatalf("releases = %v", rels)
	}
	b := e.oc.Get("releasebindings", "site-development")
	if b == nil || b["spec"].(map[string]any)["releaseName"] != "r2" {
		t.Fatalf("binding = %v", b)
	}
	want := map[string]string{"r1": autoDeploySuperseded, "r2": autoDeployDone, "r3": autoDeployDone, "r4": autoDeployPending}
	for run, w := range want {
		if got := autoState(e, run); got != w {
			t.Errorf("%s state = %q, want %q", run, got, w)
		}
	}
}

// TestAutoDeployNeverRollsBack: a build that finishes after a newer build was
// already auto-deployed is superseded, not deployed.
func TestAutoDeployNeverRollsBack(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	now := time.Now()
	e.addRun("old", "site", "img-old", BuildSuccess, now.Add(-time.Minute), map[string]any{AnnAutoDeployState: autoDeployPending})
	e.addRun("new", "site", "img-new", BuildSuccess, now, map[string]any{AnnAutoDeployState: autoDeployDone})
	if _, err := e.svc.ListBuilds(e.ctx, "site", "site"); err != nil {
		t.Fatal(err)
	}
	e.svc.WaitBackground()
	if rels := e.oc.List("componentreleases"); len(rels) != 0 {
		t.Fatalf("releases = %v", rels)
	}
	if got := autoState(e, "old"); got != autoDeploySuperseded {
		t.Fatalf("old state = %q", got)
	}
}

// TestBuildLogsReadsStepsConcurrently: live step logs are read concurrently
// (bounded) and land in step order.
func TestBuildLogsReadsStepsConcurrently(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addRun("r1", "site", "img", BuildSuccess, time.Now(), nil)
	run := e.oc.Get("workflowruns", "r1")
	var tasks []any
	e.oc.stepLogs = map[string][]string{}
	for i := range 6 {
		name := fmt.Sprintf("step-%d", i)
		tasks = append(tasks, map[string]any{"name": name, "phase": "Succeeded"})
		e.oc.stepLogs[name] = []string{name + " a", name + " b"}
	}
	run["status"].(map[string]any)["tasks"] = tasks
	e.oc.Put("workflowruns", run)
	e.oc.logDelay = 50 * time.Millisecond

	b, err := e.svc.BuildLogs(e.ctx, "site", "site", "r1")
	if err != nil {
		t.Fatal(err)
	}
	for i, st := range b.Steps {
		name := fmt.Sprintf("step-%d", i)
		if st.Name != name || len(st.Logs) != 2 || st.Logs[0] != name+" a" {
			t.Fatalf("step %d = %+v", i, st)
		}
	}
	if e.oc.maxInFlight < 2 || e.oc.maxInFlight > stepLogConcurrency {
		t.Fatalf("peak concurrent step-log reads = %d", e.oc.maxInFlight)
	}
}

// TestBuildMovesSharedWorkflowToScanningCopy: a track created before v4 on the
// shared dockerfile-builder ClusterWorkflow builds with our scanning copy
// (D15), which is upserted first, and the Component is migrated onto it.
func TestBuildMovesSharedWorkflowToScanningCopy(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("app", "app", "main", true)
	comp := e.oc.Get("components", "app")
	comp["spec"].(map[string]any)["workflow"] = map[string]any{"kind": "ClusterWorkflow", "name": "dockerfile-builder",
		"parameters": map[string]any{"repository": map[string]any{"url": "https://github.com/a/b"}}}
	comp["metadata"].(map[string]any)["annotations"].(map[string]any)[AnnPreset] = "docker"
	e.oc.Put("components", comp)

	b, err := e.svc.TriggerBuild(e.ctx, "app", "app", "")
	if err != nil {
		t.Fatal(err)
	}
	wf := e.oc.Get("workflowruns", b.ID)["spec"].(map[string]any)["workflow"].(map[string]any)
	if wf["kind"] != "Workflow" || wf["name"] != platformres.DockerWorkflowName {
		t.Fatalf("run workflow = %v", wf)
	}
	if e.oc.Get("workflows", platformres.DockerWorkflowName) == nil || e.oc.Get("workflows", platformres.PaketoWorkflowName) == nil {
		t.Fatal("scanning workflows not upserted")
	}
	cwf := e.oc.Get("components", "app")["spec"].(map[string]any)["workflow"].(map[string]any)
	if cwf["kind"] != "Workflow" || cwf["name"] != platformres.DockerWorkflowName {
		t.Fatalf("component workflow = %v", cwf)
	}
}
