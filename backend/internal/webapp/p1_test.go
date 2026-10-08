package webapp

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

func httpProbe(path string, port int) *Probe {
	p := &Probe{Type: ProbeHTTPGet, FailureThreshold: 3, SuccessThreshold: 1, InitialDelaySeconds: 5, PeriodSeconds: 10, TimeoutSeconds: 1}
	p.HTTPGet = &struct {
		Path        string       `json:"path"`
		Port        int          `json:"port"`
		HTTPHeaders []HTTPHeader `json:"httpHeaders"`
	}{Path: path, Port: port, HTTPHeaders: []HTTPHeader{{Name: "X-Probe", Value: "1"}}}
	return p
}

func TestProbeRoundTrip(t *testing.T) {
	exec := &Probe{Type: ProbeExec, FailureThreshold: 2, SuccessThreshold: 2, InitialDelaySeconds: 0, PeriodSeconds: 5, TimeoutSeconds: 2}
	exec.Exec = &struct {
		Command []string `json:"command"`
	}{Command: []string{"cat", "/tmp/ready"}}
	tcp := &Probe{Type: ProbeTCP, FailureThreshold: 3, SuccessThreshold: 1, PeriodSeconds: 10, TimeoutSeconds: 1}
	tcp.TCPSocket = &struct {
		Port int `json:"port"`
	}{Port: 8080}
	for _, p := range []*Probe{httpProbe("/healthz", 8080), exec, tcp} {
		// Through JSON, as stored on the binding.
		raw, _ := json.Marshal(probeToK8s(*p))
		var stored any
		_ = json.Unmarshal(raw, &stored)
		got := probeFromK8s(stored)
		a, _ := json.Marshal(p)
		b, _ := json.Marshal(got)
		if string(a) != string(b) {
			t.Errorf("round trip:\n got %s\nwant %s", b, a)
		}
	}
	if k := probeToK8s(*tcp); k["httpGet"] != nil || k["exec"] != nil || k["type"] != nil {
		t.Errorf("only the probe's own handler is rendered: %v", k)
	}
	// Default timings only (no handler) = unset.
	if probeFromK8s(map[string]any{"periodSeconds": 5.0}) != nil {
		t.Error("a probe without a handler must read as unset")
	}
}

func TestValidateProbe(t *testing.T) {
	cases := []struct {
		name     string
		p        *Probe
		liveness bool
		ok       bool
	}{
		{"http ok", httpProbe("/", 8080), true, true},
		{"wrong port", httpProbe("/", 9090), true, false},
		{"relative path", httpProbe("healthz", 8080), false, false},
		{"liveness success threshold", func() *Probe { p := httpProbe("/", 8080); p.SuccessThreshold = 2; return p }(), true, false},
		{"readiness success threshold", func() *Probe { p := httpProbe("/", 8080); p.SuccessThreshold = 2; return p }(), false, true},
		{"zero period", func() *Probe { p := httpProbe("/", 8080); p.PeriodSeconds = 0; return p }(), false, false},
		{"exec without command", &Probe{Type: ProbeExec, FailureThreshold: 1, SuccessThreshold: 1, PeriodSeconds: 1, TimeoutSeconds: 1}, false, false},
		{"unknown type", &Probe{Type: "grpc", FailureThreshold: 1, SuccessThreshold: 1, PeriodSeconds: 1, TimeoutSeconds: 1}, false, false},
	}
	for _, c := range cases {
		err := validateProbe(*c.p, c.liveness, 8080)
		if (err == nil) != c.ok {
			t.Errorf("%s: err = %v", c.name, err)
		}
	}
}

// deployOldRelease binds a release cut with a pre-v3 ComponentType (no probe
// schema, no traits) to development.
func (e *testEnv) deployOldRelease(release, image string) {
	e.oc.Put("workloads", map[string]any{"metadata": map[string]any{"name": "site-workload"}, "spec": map[string]any{
		"owner": map[string]any{"componentName": "site", "projectName": "default"}, "container": map[string]any{"image": "something-newer"},
	}})
	e.oc.Put("componentreleases", map[string]any{"metadata": map[string]any{"name": release}, "spec": map[string]any{
		"owner": map[string]any{"componentName": "site", "projectName": "default"}, "componentType": map[string]any{"spec": map[string]any{}},
		"workload": map[string]any{"container": map[string]any{"image": image}, "endpoints": map[string]any{"http": map[string]any{"port": 8080, "type": "HTTP"}}},
	}})
	e.oc.Put("releasebindings", map[string]any{"metadata": map[string]any{"name": "site-development"}, "spec": map[string]any{
		"owner": map[string]any{"componentName": "site", "projectName": "default"}, "environment": "development", "releaseName": release, "state": "Active",
		"componentTypeEnvironmentConfigs": map[string]any{"replicas": 1},
	}})
}

func bindingSpec(e *testEnv) map[string]any {
	return e.oc.Get("releasebindings", "site-development")["spec"].(map[string]any)
}

// TestHealthCheckRecutsPreV3Release: the first health-check write to a
// binding whose release froze an older ComponentType re-cuts the release
// (same image, current CT + HPA trait) and binds it with the probes.
func TestHealthCheckRecutsPreV3Release(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addRun("run-a", "site", "img-a", BuildSuccess, time.Now(), nil)
	e.deployOldRelease("run-a", "img-a")

	got, err := e.svc.UpdateHealthCheck(e.ctx, "site", "site", "development", HealthCheck{LivenessProbe: httpProbe("/", 8080)})
	if err != nil {
		t.Fatal(err)
	}
	if got.LivenessProbe == nil || got.LivenessProbe.HTTPGet.Path != "/" || got.ReadinessProbe != nil {
		t.Fatalf("saved = %+v", got)
	}
	spec := bindingSpec(e)
	if spec["releaseName"] != "run-a--r3" {
		t.Fatalf("binding release = %v", spec["releaseName"])
	}
	if e.releaseImage("run-a--r3") != "img-a" {
		t.Fatalf("re-cut image = %q", e.releaseImage("run-a--r3"))
	}
	ec := spec["componentTypeEnvironmentConfigs"].(map[string]any)
	if ec["replicas"] != 1.0 || ec["livenessProbe"].(map[string]any)["httpGet"] == nil {
		t.Fatalf("env configs = %v", ec)
	}
	comp := e.oc.Get("components", "site")
	if !strings.Contains(toJSON(comp), platformres.HPATraitName) {
		t.Fatalf("component lacks the HPA trait: %v", comp)
	}
	// The deployment still maps to its build.
	deps, err := e.svc.Deployments(e.ctx, "site", "site")
	if err != nil || len(deps) != 1 || deps[0].BuildID != "run-a" {
		t.Fatalf("deployments = %+v, %v", deps, err)
	}
	// A second write reuses the current release.
	if _, err := e.svc.UpdateHealthCheck(e.ctx, "site", "site", "development", HealthCheck{}); err != nil {
		t.Fatal(err)
	}
	spec = bindingSpec(e)
	if spec["releaseName"] != "run-a--r3" || spec["componentTypeEnvironmentConfigs"].(map[string]any)["livenessProbe"] != nil {
		t.Fatalf("after delete: %v", spec)
	}
}

func toJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func intp(i int) *int { return &i }

func TestValidateScaling(t *testing.T) {
	free, paid := limitsFor(platform.PlanFree), limitsFor(platform.PlanPaid)
	hpa := ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3, CPUUtilization: intp(60)}}
	one := ScalingConfig{Method: ScaleNone, FixedReplicas: 1, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}
	fixed := func(n int) ScalingConfig { c := one; c.FixedReplicas = n; return c }
	withHPA := func(min, max int) ScalingConfig {
		c := hpa
		c.HPA.MinReplicas, c.HPA.MaxReplicas = min, max
		return c
	}
	cases := []struct {
		name      string
		in, saved ScalingConfig
		l         PlanLimits
		code      Code // "" = ok
	}{
		{"hpa paid", hpa, one, paid, ""},
		{"hpa free", hpa, one, free, CodePlanRequired},
		{"hpa no target", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}, one, paid, CodeBadRequest},
		{"hpa max 6", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 6, MemoryUtilization: intp(80)}}, one, paid, CodeBadRequest},
		{"hpa min > max", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 4, MaxReplicas: 3, CPUUtilization: intp(60)}}, one, paid, CodeBadRequest},
		{"hpa target 0", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3, CPUUtilization: intp(0)}}, one, paid, CodeBadRequest},
		{"1 replica free", one, one, free, ""},
		{"2 replicas free", fixed(2), one, free, CodePlanRequired},
		{"5 replicas paid", fixed(5), one, paid, ""},
		{"6 replicas paid", fixed(6), one, paid, CodeBadRequest},
		{"unknown method", ScalingConfig{Method: "KEDA"}, one, paid, CodeBadRequest},
		// Downgraded (free) org with paid settings saved: keep or reduce, never raise.
		{"free keeps 3 replicas", fixed(3), fixed(3), free, ""},
		{"free reduces 3 -> 2", fixed(2), fixed(3), free, ""},
		{"free raises 3 -> 4", fixed(4), fixed(3), free, CodePlanRequired},
		{"free keeps hpa", withHPA(2, 4), withHPA(2, 4), free, ""},
		{"free edits hpa target", func() ScalingConfig { c := withHPA(2, 4); c.HPA.CPUUtilization = intp(80); return c }(), withHPA(2, 4), free, ""},
		{"free lowers hpa max", withHPA(1, 3), withHPA(2, 4), free, ""},
		{"free raises hpa max", withHPA(2, 5), withHPA(2, 4), free, CodePlanRequired},
		{"free raises hpa min", withHPA(3, 4), withHPA(2, 4), free, CodePlanRequired},
		{"free hpa -> fixed at saved count", fixed(2), func() ScalingConfig { c := withHPA(2, 4); c.FixedReplicas = 2; return c }(), free, ""},
	}
	for _, c := range cases {
		err := ValidateScaling(c.in, c.saved, c.l)
		e, _ := AsError(err)
		switch {
		case c.code == "" && err != nil:
			t.Errorf("%s: unexpected %v", c.name, err)
		case c.code != "" && (e == nil || e.Code != c.code):
			t.Errorf("%s: err = %v, want %s", c.name, err, c.code)
		}
	}
}

// TestScalingHPAAndBack: HPA enables the trait (re-cutting the release);
// switching to None with 2 replicas disables it and sets the replicas.
func TestScalingHPAAndBack(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.deployOldRelease("run-a", "img-a")

	e.setPlan(platform.PlanFree)
	hpa := ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3, CPUUtilization: intp(60)}}
	if _, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", hpa); err == nil {
		t.Fatal("HPA on the free plan must be rejected")
	} else if ae, _ := AsError(err); ae == nil || ae.Code != CodePlanRequired {
		t.Fatalf("err = %v", err)
	}

	e.setPlan(platform.PlanPaid)
	got, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", hpa)
	if err != nil {
		t.Fatal(err)
	}
	if got.Method != ScaleHPA || got.HPA.MaxReplicas != 3 || got.HPA.CPUUtilization == nil || *got.HPA.CPUUtilization != 60 || got.HPA.MemoryUtilization != nil {
		t.Fatalf("scaling = %+v", got)
	}
	spec := bindingSpec(e)
	cfg := spec["traitEnvironmentConfigs"].(map[string]any)["hpa"].(map[string]any)
	if cfg["enabled"] != true || cfg["minReplicas"] != 1.0 || cfg["cpuUtilization"] != 60.0 {
		t.Fatalf("trait config = %v", cfg)
	}
	if spec["releaseName"] != "run-a--r3" {
		t.Fatalf("release = %v", spec["releaseName"])
	}

	got, err = e.svc.UpdateScaling(e.ctx, "site", "site", "development", ScalingConfig{Method: ScaleNone, FixedReplicas: 2, HPA: hpa.HPA})
	if err != nil {
		t.Fatal(err)
	}
	if got.Method != ScaleNone || got.FixedReplicas != 2 {
		t.Fatalf("scaling = %+v", got)
	}
	spec = bindingSpec(e)
	if hp := spec["traitEnvironmentConfigs"].(map[string]any)["hpa"].(map[string]any); hp["enabled"] != false || hp["cpuUtilization"] != 60.0 || spec["componentTypeEnvironmentConfigs"].(map[string]any)["replicas"] != 2.0 {
		t.Fatalf("binding = %v", spec)
	}
}

func TestExceedsResourceAllowance(t *testing.T) {
	def := ContainerUpdate{CPURequest: 100, CPULimit: 100, MemoryRequest: 350, MemoryLimit: 1024}
	atDefaults := Container{CPURequest: 100, CPULimit: 100, MemoryRequest: 350, MemoryLimit: 1024}
	if ExceedsResourceAllowance(def, atDefaults) {
		t.Error("defaults are within the allowance")
	}
	small := ContainerUpdate{CPURequest: 50, CPULimit: 100, MemoryRequest: 128, MemoryLimit: 512}
	if ExceedsResourceAllowance(small, atDefaults) {
		t.Error("less than the defaults is allowed on every plan")
	}
	for _, u := range []ContainerUpdate{
		{CPURequest: 100, CPULimit: 200, MemoryRequest: 350, MemoryLimit: 1024},
		{CPURequest: 100, CPULimit: 100, MemoryRequest: 351, MemoryLimit: 1024},
		{CPURequest: 100, CPULimit: 100, MemoryRequest: 350, MemoryLimit: 2048},
	} {
		if !ExceedsResourceAllowance(u, atDefaults) {
			t.Errorf("%+v is above the defaults", u)
		}
	}
	// Already above the defaults (plan downgrade): keeping or lowering is fine, raising is not.
	big := Container{CPURequest: 500, CPULimit: 1000, MemoryRequest: 512, MemoryLimit: 2048}
	keep := ContainerUpdate{CPURequest: 500, CPULimit: 1000, MemoryRequest: 512, MemoryLimit: 2048}
	lower := ContainerUpdate{CPURequest: 200, CPULimit: 500, MemoryRequest: 512, MemoryLimit: 1536}
	if ExceedsResourceAllowance(keep, big) || ExceedsResourceAllowance(lower, big) {
		t.Error("keeping or lowering saved above-default resources is allowed")
	}
	if !ExceedsResourceAllowance(ContainerUpdate{CPURequest: 500, CPULimit: 1500, MemoryRequest: 512, MemoryLimit: 2048}, big) {
		t.Error("raising a saved above-default limit is not")
	}
}

// TestDowngradedPlanSavesExistingSettings: a free org whose environment
// still has paid settings can save changes that don't raise them.
func TestDowngradedPlanSavesExistingSettings(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.deployOldRelease("run-a", "img-a")
	if _, err := e.svc.UpdateContainer(e.ctx, "site", "site", "development", "main", ContainerUpdate{ImagePullPolicy: "IfNotPresent", CPURequest: 500, CPULimit: 1000, MemoryRequest: 512, MemoryLimit: 2048}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", ScalingConfig{Method: ScaleNone, FixedReplicas: 3, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}); err != nil {
		t.Fatal(err)
	}
	e.setPlan(platform.PlanFree)
	// Change only the pull policy; resources stay above the defaults.
	if _, err := e.svc.UpdateContainer(e.ctx, "site", "site", "development", "main", ContainerUpdate{ImagePullPolicy: "Always", CPURequest: 500, CPULimit: 1000, MemoryRequest: 512, MemoryLimit: 2048}); err != nil {
		t.Fatalf("unchanged resources: %v", err)
	}
	_, err := e.svc.UpdateContainer(e.ctx, "site", "site", "development", "main", ContainerUpdate{ImagePullPolicy: "Always", CPURequest: 500, CPULimit: 2000, MemoryRequest: 512, MemoryLimit: 2048})
	if ae, _ := AsError(err); ae == nil || ae.Code != CodePlanRequired {
		t.Fatalf("raising the CPU limit: %v", err)
	}
	if _, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", ScalingConfig{Method: ScaleNone, FixedReplicas: 2, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}); err != nil {
		t.Fatalf("reducing replicas: %v", err)
	}
	_, err = e.svc.UpdateScaling(e.ctx, "site", "site", "development", ScalingConfig{Method: ScaleNone, FixedReplicas: 3, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}})
	if ae, _ := AsError(err); ae == nil || ae.Code != CodePlanRequired {
		t.Fatalf("raising replicas back: %v", err)
	}
}

func TestEnvironmentGating(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.addRun("run-a", "site", "img-a", BuildSuccess, time.Now(), nil)
	e.setPlan(platform.PlanFree)
	if _, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("development", "run-a")); err != nil {
		t.Fatalf("the first environment is on every plan: %v", err)
	}
	_, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("production", "run-a"))
	if ae, _ := AsError(err); ae == nil || ae.Code != CodePlanRequired {
		t.Fatalf("deploy to production on free: %v", err)
	}
	e.setPlan(platform.PlanPaid)
	if _, err := e.svc.Deploy(e.ctx, "site", "site", deployInput("production", "run-a")); err != nil {
		t.Fatalf("paid: %v", err)
	}
}

func TestImageRef(t *testing.T) {
	ok := map[[2]string]string{
		{"nginxinc/nginx-unprivileged", "stable-alpine"}: "nginxinc/nginx-unprivileged:stable-alpine",
		{"ghcr.io/owner/app", ""}:                        "ghcr.io/owner/app:latest",
		{"registry.example.com:5000/team/app", "v1.2.3"}: "registry.example.com:5000/team/app:v1.2.3",
		{"nginx", "1.27"}:                                "nginx:1.27",
	}
	for in, want := range ok {
		got, err := ImageRef(in[0], in[1])
		if err != nil || got != want {
			t.Errorf("ImageRef(%q, %q) = %q, %v", in[0], in[1], got, err)
		}
	}
	for _, in := range [][2]string{{"Nginx", "1"}, {"nginx:1.27", ""}, {"nginx@sha256:abc", ""}, {"", "x"}, {"nginx", "bad tag"}, {"nginx", "-x"}} {
		if _, err := ImageRef(in[0], in[1]); err == nil {
			t.Errorf("ImageRef(%q, %q) should fail", in[0], in[1])
		}
	}
}

func TestCreateImageWebAppAndDeployTag(t *testing.T) {
	e := newTestEnv(t)
	w, err := e.svc.CreateWebApp(e.ctx, "default", CreateWebAppInput{
		SourceType: SourceDocker, DisplayName: "Nginx", Handler: "nginx", Image: "nginxinc/nginx-unprivileged", Tag: "stable-alpine", Port: 8080,
	})
	if err != nil {
		t.Fatal(err)
	}
	if w.SourceType != SourceDocker || w.BuildPreset != string(PresetDocker) {
		t.Fatalf("web app = %+v", w)
	}
	comp := e.oc.Get("components", "nginx")
	spec := comp["spec"].(map[string]any)
	if spec["workflow"] != nil || !strings.Contains(toJSON(spec["traits"]), platformres.HPATraitName) {
		t.Fatalf("component spec = %v", spec)
	}
	b := bindingSpec2(e, "nginx-development")
	rel, _ := b["releaseName"].(string)
	if !strings.HasPrefix(rel, "nginx-img-") || e.releaseImage(rel) != "nginxinc/nginx-unprivileged:stable-alpine" {
		t.Fatalf("binding = %v (image %q)", b, e.releaseImage(rel))
	}
	src, err := e.svc.ImageSource(e.ctx, "nginx", "nginx")
	if err != nil || src.Tag != "stable-alpine" || src.Port != 8080 {
		t.Fatalf("image source = %+v, %v", src, err)
	}
	if _, err := e.svc.TriggerBuild(e.ctx, "nginx", "nginx", ""); err == nil {
		t.Fatal("image web apps have no builds")
	}

	d, err := e.svc.DeployImageTag(e.ctx, "nginx", "nginx", DeployImageInput{Tag: "1.27-alpine"})
	if err != nil {
		t.Fatal(err)
	}
	if d.Image != "nginxinc/nginx-unprivileged:1.27-alpine" {
		t.Fatalf("deployment = %+v", d)
	}
	rel2, _ := bindingSpec2(e, "nginx-development")["releaseName"].(string)
	if rel2 == rel || e.releaseImage(rel2) != d.Image {
		t.Fatalf("new tag not bound: %s", rel2)
	}
	if src, _ := e.svc.ImageSource(e.ctx, "nginx", "nginx"); src.Tag != "1.27-alpine" {
		t.Fatalf("tag not recorded: %+v", src)
	}
	deps, err := e.svc.Deployments(e.ctx, "nginx", "nginx")
	if err != nil || len(deps) != 1 || deps[0].Image != d.Image {
		t.Fatalf("deployments = %+v, %v", deps, err)
	}
}

func bindingSpec2(e *testEnv, name string) map[string]any {
	b := e.oc.Get("releasebindings", name)
	if b == nil {
		return map[string]any{}
	}
	return b["spec"].(map[string]any)
}

func TestBuildMetrics(t *testing.T) {
	t0 := time.Date(2026, 10, 8, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Minute)
	s := func(vs ...float64) []platform.MetricSample {
		out := []platform.MetricSample{}
		for i, v := range vs {
			out = append(out, platform.MetricSample{Time: t0.Add(time.Duration(i) * time.Minute), Value: v})
		}
		return out
	}
	res := map[string][]platform.MetricSample{
		"cpuUsage": s(0.01234, 0.02), "cpuRequests": s(0.2, 0.2), "cpuLimits": s(0.2, 0.2),
		"memoryUsage": s(4*mib, 5*mib), "memoryRequests": s(700*mib, 700*mib), "memoryLimits": s(2048*mib, 2048*mib),
	}
	alloc := Allocation{Replicas: 2, CPURequest: 0.1, CPULimit: 0.1, MemoryRequestMB: 350, MemoryLimitMB: 1024}
	m := BuildMetrics(res, map[string][]platform.MetricSample{}, alloc)
	if m.HTTPAvailable || len(m.RequestRows) != 0 || len(m.ErrorRows) != 0 {
		t.Fatalf("no HTTP data: %+v", m)
	}
	if len(m.CPURows) != 2 || m.CPURows[0]["usage"] != 0.0123 || m.CPURows[1]["time"] != t1.Format(time.RFC3339) {
		t.Fatalf("cpu rows = %v", m.CPURows)
	}
	if m.MemoryRows[0]["usage"] != 4.0 || m.MemoryRows[0]["limit"] != 2048.0 {
		t.Fatalf("memory rows = %v", m.MemoryRows)
	}
	// Request/limit samples where usage has none add no (usage-less) rows.
	gappy := map[string][]platform.MetricSample{
		"cpuUsage": s(0.01), "cpuRequests": s(0.2, 0.2, 0.2), "cpuLimits": s(0.2, 0.2, 0.2),
		"memoryUsage": s(4 * mib), "memoryRequests": s(700*mib, 700*mib), "memoryLimits": s(2048*mib, 2048*mib),
	}
	g := BuildMetrics(gappy, nil, alloc)
	if len(g.CPURows) != 1 || len(g.MemoryRows) != 1 || g.CPURows[0]["usage"] != 0.01 || g.CPURows[0]["limit"] != 0.2 || g.MemoryRows[0]["request"] != 700.0 {
		t.Fatalf("rows without usage: cpu %v memory %v", g.CPURows, g.MemoryRows)
	}
	http := map[string][]platform.MetricSample{
		"requestCount": s(10, 0), "successfulRequestCount": s(9, 0), "unsuccessfulRequestCount": s(1, 0),
		"latencyP50": s(0.012, 0), "latencyP90": s(0.05, 0), "latencyP99": s(0.1234, 0),
	}
	m = BuildMetrics(res, http, alloc)
	if !m.HTTPAvailable || m.ErrorRows[0]["errorRate"] != 10.0 || m.ErrorRows[1]["errorRate"] != 0.0 {
		t.Fatalf("error rows = %v", m.ErrorRows)
	}
	if m.LatencyRows[0]["p99"] != 123.4 || m.RequestRows[0]["success"] != 9.0 {
		t.Fatalf("latency %v requests %v", m.LatencyRows, m.RequestRows)
	}
}

// TestMetricsRollout: during a rolling restart the old and new pod coexist, so
// the Observer's request/limit sums double for a moment. The chart's request
// and limit stay at per-replica × desired replicas; usage is still the sum.
func TestMetricsRollout(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.deployOldRelease("run-a", "img-a")
	t0 := time.Date(2026, 10, 8, 10, 0, 0, 0, time.UTC)
	s := func(vs ...float64) []platform.MetricSample {
		out := []platform.MetricSample{}
		for i, v := range vs {
			out = append(out, platform.MetricSample{Time: t0.Add(time.Duration(i) * time.Minute), Value: v})
		}
		return out
	}
	// Minute 1: two pods (old + new) — sums double; usage of both pods adds up.
	e.logs.metrics = map[string]map[string][]platform.MetricSample{"resource": {
		"cpuUsage": s(0.02, 0.05, 0.03), "cpuRequests": s(0.1, 0.2, 0.1), "cpuLimits": s(0.1, 0.2, 0.1),
		"memoryUsage": s(40*mib, 90*mib, 45*mib), "memoryRequests": s(350*mib, 700*mib, 350*mib), "memoryLimits": s(1024*mib, 2048*mib, 1024*mib),
	}}
	m, err := e.svc.Metrics(e.ctx, "site", "site", "development", "30m")
	if err != nil {
		t.Fatal(err)
	}
	if m.Replicas != 1 || len(m.CPURows) != 3 || len(m.MemoryRows) != 3 {
		t.Fatalf("metrics = %+v", m)
	}
	for i, r := range m.CPURows {
		if r["limit"] != 0.1 || r["request"] != 0.1 {
			t.Errorf("cpu row %d = %v, want request/limit 0.1", i, r)
		}
	}
	for i, r := range m.MemoryRows {
		if r["limit"] != 1024.0 || r["request"] != 350.0 {
			t.Errorf("memory row %d = %v, want request 350 / limit 1024", i, r)
		}
	}
	if m.CPURows[1]["usage"] != 0.05 || m.MemoryRows[1]["usage"] != 90.0 {
		t.Fatalf("usage must stay the sum across pods: cpu %v memory %v", m.CPURows[1], m.MemoryRows[1])
	}

	// Two fixed replicas: the allocation doubles (and stays put through a rollout).
	e.setPlan(platform.PlanPaid)
	if _, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", ScalingConfig{Method: ScaleNone, FixedReplicas: 2, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}); err != nil {
		t.Fatal(err)
	}
	m, err = e.svc.Metrics(e.ctx, "site", "site", "development", "30m")
	if err != nil {
		t.Fatal(err)
	}
	if m.Replicas != 2 || m.CPURows[1]["limit"] != 0.2 || m.MemoryRows[1]["limit"] != 2048.0 {
		t.Fatalf("2 replicas: replicas %d cpu %v memory %v", m.Replicas, m.CPURows[1], m.MemoryRows[1])
	}

	// HPA without a readable live HPA (the fake has no resource tree): its min replicas.
	hpa := ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 3, MaxReplicas: 5, CPUUtilization: intp(60)}}
	if _, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", hpa); err != nil {
		t.Fatal(err)
	}
	if m, err = e.svc.Metrics(e.ctx, "site", "site", "development", "30m"); err != nil || m.Replicas != 3 || m.CPURows[0]["limit"] != 0.3 {
		t.Fatalf("hpa: %+v, %v", m, err)
	}
}

func TestDesiredReplicas(t *testing.T) {
	node := func(kind string, obj map[string]any) gen.ResourceNode {
		return gen.ResourceNode{Kind: kind, Object: obj}
	}
	tree := func(nodes ...gen.ResourceNode) *gen.K8sResourceTreeResponse {
		return &gen.K8sResourceTreeResponse{RenderedReleases: []gen.ReleaseResourceTree{{Nodes: nodes}}}
	}
	deploy := node("Deployment", map[string]any{"spec": map[string]any{"replicas": 2.0}})
	hpa := node("HorizontalPodAutoscaler", map[string]any{"status": map[string]any{"desiredReplicas": 4.0, "currentReplicas": 2.0}})
	pod := node("Pod", map[string]any{})
	for name, tc := range map[string]struct {
		tree *gen.K8sResourceTreeResponse
		want int
	}{
		"nil":           {nil, 0},
		"pods only":     {tree(pod, pod), 0},
		"deployment":    {tree(deploy, pod, pod), 2},
		"hpa wins":      {tree(deploy, hpa, pod), 4},
		"hpa no status": {tree(deploy, node("HorizontalPodAutoscaler", map[string]any{})), 2},
	} {
		if got := DesiredReplicas(tc.tree); got != tc.want {
			t.Errorf("%s: DesiredReplicas = %d, want %d", name, got, tc.want)
		}
	}
}

func TestBuildOfRelease(t *testing.T) {
	for in, want := range map[string]string{"site-261008-ab": "site-261008-ab", "site-261008-ab--r3": "site-261008-ab", "site-img-261008-ab--r12": "site-img-261008-ab", "site--main-1": "site--main-1"} {
		if got := buildOfRelease(in); got != want {
			t.Errorf("buildOfRelease(%q) = %q", in, got)
		}
	}
}

// TestRecutReleaseWithoutSpec: a bound release with no spec (or a track
// without a workload spec) fails the P1 write cleanly instead of panicking.
func TestRecutReleaseWithoutSpec(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.deployOldRelease("run-a", "img-a")
	e.oc.Put("componentreleases", map[string]any{"metadata": map[string]any{"name": "run-a"}})
	_, err := e.svc.UpdateHealthCheck(e.ctx, "site", "site", "development", HealthCheck{LivenessProbe: httpProbe("/", 8080)})
	if ae, _ := AsError(err); ae == nil || ae.Code != CodeConflict {
		t.Fatalf("err = %v, want CONFLICT", err)
	}
	if err := e.svc.writeFrozenWorkload(e.ctx, track{Name: "site"}, nil); err == nil {
		t.Fatal("nil release must fail")
	}
	if err := e.svc.writeFrozenWorkload(e.ctx, track{Name: "site"}, &gen.ComponentRelease{}); err == nil {
		t.Fatal("release without spec must fail")
	}
}

func TestIntOr(t *testing.T) {
	if intOr(3.0, 9) != 3 || intOr(4, 9) != 4 || intOr("5", 9) != 9 || intOr(nil, 9) != 9 || intOf(nil) != 0 {
		t.Fatal("intOr")
	}
	// Absent timings take the Kubernetes defaults.
	p := probeFromK8s(map[string]any{"tcpSocket": map[string]any{"port": 8080.0}})
	if p == nil || p.PeriodSeconds != 10 || p.TimeoutSeconds != 1 || p.FailureThreshold != 3 || p.SuccessThreshold != 1 || p.TCPSocket.Port != 8080 {
		t.Fatalf("probe = %+v", p)
	}
}

// TestImageDeploymentsReadEachReleaseOnce: environments bound to the same
// release share one release read.
func TestImageDeploymentsReadEachReleaseOnce(t *testing.T) {
	e := newTestEnv(t)
	if _, err := e.svc.CreateWebApp(e.ctx, "default", CreateWebAppInput{
		SourceType: SourceDocker, DisplayName: "Nginx", Handler: "nginx", Image: "nginxinc/nginx-unprivileged", Tag: "stable-alpine", Port: 8080,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Promote(e.ctx, "nginx", "nginx", PromoteInput{SourceEnvironment: "development", TargetEnvironment: "production"}); err != nil {
		t.Fatal(err)
	}
	e.oc.mu.Lock()
	e.oc.gets = nil
	e.oc.mu.Unlock()
	deps, err := e.svc.Deployments(e.ctx, "nginx", "nginx")
	if err != nil || len(deps) != 2 || deps[0].Image != "nginxinc/nginx-unprivileged:stable-alpine" || deps[1].Image != deps[0].Image {
		t.Fatalf("deployments = %+v, %v", deps, err)
	}
	reads := 0
	for _, g := range e.oc.gets {
		if strings.HasPrefix(g, "componentreleases/") {
			reads++
		}
	}
	if reads != 1 {
		t.Fatalf("release reads = %d (%v), want 1", reads, e.oc.gets)
	}
}

// TestEnsureAttachesTraitsInBackground: the first EnsurePlatformResources
// returns without waiting for the track Components to get the HPA trait;
// the pass runs once per namespace and attaches it to every track.
func TestEnsureAttachesTraitsInBackground(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("a", "a", "main", true)
	e.addTrack("b", "b", "main", true)
	release := make(chan struct{})
	var mu sync.Mutex
	updates := 0
	e.oc.beforeUpdate = func(coll, _ string) {
		if coll == "components" {
			<-release
			mu.Lock()
			updates++
			mu.Unlock()
		}
	}
	done := make(chan error, 1)
	go func() { done <- e.svc.EnsurePlatformResources(e.ctx) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("EnsurePlatformResources waited for the trait attach pass")
	}
	close(release)
	e.svc.WaitBackground()
	for _, name := range []string{"a", "b"} {
		if !strings.Contains(toJSON(e.oc.Get("components", name)), platformres.HPATraitName) {
			t.Errorf("component %s lacks the HPA trait", name)
		}
	}
	// A second namespace-wide pass is not started (once per namespace and
	// version): a track that lost the trait keeps lacking it until the lazy
	// ensureTrackTrait path runs.
	e.addTrack("a", "a", "main", true)
	e.svc.ensured.Delete(testNS)
	if err := e.svc.EnsurePlatformResources(e.ctx); err != nil {
		t.Fatal(err)
	}
	e.svc.WaitBackground()
	mu.Lock()
	defer mu.Unlock()
	if updates != 2 || strings.Contains(toJSON(e.oc.Get("components", "a")), platformres.HPATraitName) {
		t.Fatalf("component updates = %d, want 2 (one pass)", updates)
	}
}

// TestFixedReplicasOnPreV3Release: fixed replicas and container resources go
// through the same re-cut-aware writer as HPA/health checks — the release is
// upgraded (and the disabled HPA settings kept). When the re-cut fails, the
// replicas still land on the old release, without a trait config (the release
// has no HPA trait instance; OpenChoreo would silently ignore it), while
// strict settings fail.
func TestFixedReplicasOnPreV3Release(t *testing.T) {
	e := newTestEnv(t)
	e.addTrack("site", "site", "main", true)
	e.deployOldRelease("run-a", "img-a")
	fixed := ScalingConfig{Method: ScaleNone, FixedReplicas: 2, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3, CPUUtilization: intp(60)}}
	if _, err := e.svc.UpdateScaling(e.ctx, "site", "site", "development", fixed); err != nil {
		t.Fatal(err)
	}
	spec := bindingSpec(e)
	if spec["releaseName"] != "run-a--r3" || spec["componentTypeEnvironmentConfigs"].(map[string]any)["replicas"] != 2.0 {
		t.Fatalf("binding = %v", spec)
	}
	if hp, _ := spec["traitEnvironmentConfigs"].(map[string]any)["hpa"].(map[string]any); hp["enabled"] != false || hp["cpuUtilization"] != 60.0 {
		t.Fatalf("trait config = %v", spec["traitEnvironmentConfigs"])
	}

	// Container resources on a pre-v3 release re-cut it too.
	e2 := newTestEnv(t)
	e2.addTrack("site", "site", "main", true)
	e2.deployOldRelease("run-a", "img-a")
	if _, err := e2.svc.UpdateContainer(e2.ctx, "site", "site", "development", "main", ContainerUpdate{ImagePullPolicy: "Always", CPURequest: 50, CPULimit: 100, MemoryRequest: 256, MemoryLimit: 512}); err != nil {
		t.Fatal(err)
	}
	if spec := bindingSpec(e2); spec["releaseName"] != "run-a--r3" || spec["traitEnvironmentConfigs"] != nil {
		t.Fatalf("container update binding = %v", spec)
	}

	// The re-cut fails (a concurrent workload change spoils the snapshot).
	e3 := newTestEnv(t)
	e3.addTrack("site", "site", "main", true)
	e3.deployOldRelease("run-a", "img-a")
	e3.oc.beforeGenerate = func(string, string) {
		e3.oc.Put("workloads", map[string]any{"metadata": map[string]any{"name": "site-workload"}, "spec": map[string]any{
			"owner": map[string]any{"componentName": "site", "projectName": "default"}, "container": map[string]any{"image": "img-other"},
		}})
	}
	if _, err := e3.svc.UpdateScaling(e3.ctx, "site", "site", "development", fixed); err != nil {
		t.Fatalf("fixed replicas must not need the re-cut: %v", err)
	}
	spec = bindingSpec(e3)
	if spec["releaseName"] != "run-a" || spec["componentTypeEnvironmentConfigs"].(map[string]any)["replicas"] != 2.0 || spec["traitEnvironmentConfigs"] != nil {
		t.Fatalf("binding after failed re-cut = %v", spec)
	}
	if _, err := e3.svc.UpdateHealthCheck(e3.ctx, "site", "site", "development", HealthCheck{LivenessProbe: httpProbe("/", 8080)}); err == nil {
		t.Fatal("health checks need the current release")
	}
	hpa := fixed
	hpa.Method = ScaleHPA
	if _, err := e3.svc.UpdateScaling(e3.ctx, "site", "site", "development", hpa); err == nil {
		t.Fatal("autoscaling needs the current release")
	}
	if spec := bindingSpec(e3); spec["traitEnvironmentConfigs"] != nil || spec["releaseName"] != "run-a" {
		t.Fatalf("binding after failed strict writes = %v", spec)
	}
}
