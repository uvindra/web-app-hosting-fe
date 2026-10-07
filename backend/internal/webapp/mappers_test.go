package webapp

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

func mustJSON[T any](t *testing.T, s string) T {
	t.Helper()
	var v T
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestRunStatus(t *testing.T) {
	cases := map[string]string{
		`{"metadata":{"name":"r"}}`: BuildInProgress,
		`{"metadata":{"name":"r"},"status":{"conditions":[{"type":"WorkflowCompleted","status":"True","reason":"WorkflowSucceeded","lastTransitionTime":"2026-10-07T09:00:00Z"}]}}`: BuildSuccess,
		`{"metadata":{"name":"r"},"status":{"conditions":[{"type":"WorkflowCompleted","status":"True","reason":"WorkflowFailed","lastTransitionTime":"2026-10-07T09:00:00Z"}]}}`:    BuildFailed,
		`{"metadata":{"name":"r"},"status":{"conditions":[{"type":"WorkflowCompleted","status":"False","reason":"WorkflowPending","lastTransitionTime":"2026-10-07T09:00:00Z"}]}}`:  BuildInProgress,
	}
	for in, want := range cases {
		if got := RunStatus(mustJSON[gen.WorkflowRun](t, in)); got != want {
			t.Errorf("RunStatus(%s) = %s, want %s", in, got, want)
		}
	}
}

func TestToBuildRun(t *testing.T) {
	r := mustJSON[gen.WorkflowRun](t, `{"metadata":{"name":"app-1","creationTimestamp":"2026-10-07T09:00:00Z","annotations":{"web-app-hosting.wso2.com/commit-sha":"abc","web-app-hosting.wso2.com/commit-message":"fix","web-app-hosting.wso2.com/commit-author":"me"}},
	  "status":{"tasks":[{"name":"checkout-source","phase":"Succeeded"},{"name":"build-image","phase":"Running"},{"name":"publish-image"}]}}`)
	b := toBuildRun(r, "main")
	if b.ID != "app-1" || b.CommitSHA != "abc" || b.Author != "me" || b.Branch != "main" || b.Status != BuildInProgress {
		t.Fatalf("unexpected %+v", b)
	}
	if len(b.Steps) != 3 || b.Steps[0].Status != BuildSuccess || b.Steps[1].Status != BuildInProgress || b.Steps[2].Status != "pending" {
		t.Fatalf("steps %+v", b.Steps)
	}
}

func TestDeploymentStatusAndURL(t *testing.T) {
	ready := mustJSON[gen.ReleaseBinding](t, `{"metadata":{"name":"b"},"spec":{"environment":"development","owner":{"componentName":"c","projectName":"p"},"releaseName":"r"},
	  "status":{"conditions":[{"type":"Ready","status":"True","reason":"Ready","lastTransitionTime":"2026-10-07T09:00:00Z"}],
	  "endpoints":[{"name":"http","externalURLs":{"http":{"host":"h.example","port":19080,"scheme":"http"},"https":{"host":"h.example","port":443,"scheme":"https"}}}]}}`)
	if deploymentStatus(ready) != DeployActive {
		t.Error("ready binding should be active")
	}
	if u := (&Service{}).bindingURL(ready); u != "https://h.example" {
		t.Errorf("url = %s", u)
	}
	if u := (&Service{opts: Options{PreferHTTP: true}}).bindingURL(ready); u != "http://h.example:19080" {
		t.Errorf("http url = %s", u)
	}
	failed := mustJSON[gen.ReleaseBinding](t, `{"metadata":{"name":"b"},"spec":{"environment":"d","owner":{"componentName":"c","projectName":"p"},"releaseName":"r"},"status":{"conditions":[{"type":"Ready","status":"False","reason":"ResourceApplyFailed","lastTransitionTime":"2026-10-07T09:00:00Z"}]}}`)
	if deploymentStatus(failed) != DeployFailed {
		t.Error("expected failed")
	}
	stopped := mustJSON[gen.ReleaseBinding](t, `{"metadata":{"name":"b"},"spec":{"environment":"d","owner":{"componentName":"c","projectName":"p"},"releaseName":"r","state":"Undeploy"}}`)
	if deploymentStatus(stopped) != DeployStopped || bindingActive(stopped) {
		t.Error("expected stopped and inactive")
	}
}

func TestPromotionOrder(t *testing.T) {
	dp := mustJSON[gen.DeploymentPipeline](t, `{"metadata":{"name":"default"},"spec":{"promotionPaths":[
	  {"sourceEnvironmentRef":{"name":"staging"},"targetEnvironmentRefs":[{"name":"production"}]},
	  {"sourceEnvironmentRef":{"name":"development"},"targetEnvironmentRefs":[{"name":"staging"}]}]}}`)
	got := PromotionOrder(&dp)
	if len(got) != 3 || got[0] != "development" || got[1] != "staging" || got[2] != "production" {
		t.Fatalf("order = %v", got)
	}
	envs := []Environment{{ID: "development"}, {ID: "staging"}}
	if nextEnvironment(envs, "development") != "staging" || nextEnvironment(envs, "staging") != "" {
		t.Error("nextEnvironment")
	}
}

func TestPodFromObject(t *testing.T) {
	obj := mustJSON[map[string]any](t, `{"spec":{"containers":[{"resources":{"limits":{"cpu":"100m","memory":"1Gi"}}}]},
	  "status":{"phase":"Running","startTime":"2026-10-07T09:00:00Z","containerStatuses":[{"ready":true,"restartCount":2}],
	  "conditions":[{"type":"Ready","status":"True","lastTransitionTime":"2026-10-07T09:01:00Z"},{"type":"PodReadyToStartContainers","status":"True"}]}}`)
	p := PodFromObject("pod-1", obj)
	if p.Phase != "Running" || p.Ready != "1/1" || p.Restarts != 2 || p.CPULimitMillicores != 100 || p.MemoryLimitBytes != 1<<30 || len(p.Conditions) != 1 {
		t.Fatalf("pod = %+v", p)
	}
}

func TestQuantities(t *testing.T) {
	if ParseCPU("250m") != 250 || ParseCPU("1") != 1000 || ParseCPU("0.5") != 500 {
		t.Error("cpu")
	}
	if ParseMemory("350Mi") != 350<<20 || ParseMemory("1Gi") != 1<<30 || ParseMemory("1M") != 1e6 {
		t.Error("memory")
	}
}

func TestToLogRow(t *testing.T) {
	r := ToLogRow(platform.LogEntry{Timestamp: time.Unix(0, 0), Log: `10.0.0.1 - - [07/Oct/2026] "GET /missing.js HTTP/1.1" 404 153 "-" "curl"`, Pod: "p"}, 0)
	if r.Source != "access" || r.Method != "GET" || r.Path != "/missing.js" || r.StatusCode != 404 || r.Level != "WARN" {
		t.Fatalf("row = %+v", r)
	}
	if r2 := ToLogRow(platform.LogEntry{Log: "started", Level: "warning"}, 1); r2.Source != "app" || r2.Level != "WARN" {
		t.Fatalf("row2 = %+v", r2)
	}
}

func TestConfigItemsFromBinding(t *testing.T) {
	b := mustJSON[gen.ReleaseBinding](t, `{"metadata":{"name":"b","annotations":{"web-app-hosting.wso2.com/configs":"[{\"id\":\"env\",\"name\":\"env\",\"kind\":\"config\",\"keys\":[\"A\"]},{\"id\":\"s\",\"name\":\"s\",\"kind\":\"secret\",\"keys\":[\"K\"],\"secretRef\":\"s\"},{\"id\":\"f\",\"name\":\"f\",\"kind\":\"file\",\"keys\":[\"config.js\"],\"mountPath\":\"/usr/share/nginx/html\"}]"}},
	  "spec":{"environment":"d","owner":{"componentName":"c","projectName":"p"},"workloadOverrides":{"container":{"env":[{"key":"A","value":"1"},{"key":"K","valueFrom":{"secretKeyRef":{"name":"s","key":"K"}}}],
	  "files":[{"key":"config.js","mountPath":"/usr/share/nginx/html","value":"window.x=1"}]}}}}`)
	items := toConfigItems(b)
	if len(items) != 3 || items[0].Entries[0].Value != "1" || !items[1].Entries[0].Masked || items[1].Entries[0].Value != "" || items[2].Entries[0].Value != "window.x=1" {
		t.Fatalf("items = %+v", items)
	}
	// Removing a config drops only its own values.
	c := overrides(b.Spec)
	removeConfigValues(c, configMeta{Kind: KindConfig, Keys: []string{"A"}})
	if len(*c.Env) != 1 || (*c.Env)[0].Key != "K" {
		t.Fatalf("env after remove = %+v", *c.Env)
	}
}

func TestEnsureWorkloadEndpoint(t *testing.T) {
	spec := &gen.WorkloadSpec{Container: &gen.WorkloadContainer{Image: "img"}}
	if !ensureWorkloadEndpoint(spec, track{Preset: PresetNode, Port: 3000}) {
		t.Fatal("expected change")
	}
	ep := (*spec.Endpoints)["http"]
	if ep.Port != 3000 || ep.Type != gen.WorkloadEndpointTypeHTTP || len(*spec.Container.Env) != 1 {
		t.Fatalf("spec = %+v", spec)
	}
	if ensureWorkloadEndpoint(spec, track{Preset: PresetNode, Port: 3000}) {
		t.Fatal("second call should be a no-op")
	}
}
