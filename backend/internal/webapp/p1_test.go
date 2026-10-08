package webapp

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

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
	cases := []struct {
		name string
		in   ScalingConfig
		l    PlanLimits
		code Code // "" = ok
	}{
		{"hpa paid", hpa, paid, ""},
		{"hpa free", hpa, free, CodePlanRequired},
		{"hpa no target", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}, paid, CodeBadRequest},
		{"hpa max 6", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 6, MemoryUtilization: intp(80)}}, paid, CodeBadRequest},
		{"hpa min > max", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 4, MaxReplicas: 3, CPUUtilization: intp(60)}}, paid, CodeBadRequest},
		{"hpa target 0", ScalingConfig{Method: ScaleHPA, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3, CPUUtilization: intp(0)}}, paid, CodeBadRequest},
		{"1 replica free", ScalingConfig{Method: ScaleNone, FixedReplicas: 1}, free, ""},
		{"2 replicas free", ScalingConfig{Method: ScaleNone, FixedReplicas: 2}, free, CodePlanRequired},
		{"5 replicas paid", ScalingConfig{Method: ScaleNone, FixedReplicas: 5}, paid, ""},
		{"6 replicas paid", ScalingConfig{Method: ScaleNone, FixedReplicas: 6}, paid, CodeBadRequest},
		{"unknown method", ScalingConfig{Method: "KEDA"}, paid, CodeBadRequest},
	}
	for _, c := range cases {
		err := ValidateScaling(c.in, c.l)
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

	got, err = e.svc.UpdateScaling(e.ctx, "site", "site", "development", ScalingConfig{Method: ScaleNone, FixedReplicas: 2})
	if err != nil {
		t.Fatal(err)
	}
	if got.Method != ScaleNone || got.FixedReplicas != 2 {
		t.Fatalf("scaling = %+v", got)
	}
	spec = bindingSpec(e)
	if spec["traitEnvironmentConfigs"].(map[string]any)["hpa"].(map[string]any)["enabled"] != false || spec["componentTypeEnvironmentConfigs"].(map[string]any)["replicas"] != 2.0 {
		t.Fatalf("binding = %v", spec)
	}
}

func TestAboveDefaultResources(t *testing.T) {
	def := ContainerUpdate{CPURequest: 100, CPULimit: 100, MemoryRequest: 350, MemoryLimit: 1024}
	if AboveDefaultResources(def) {
		t.Error("defaults are not above defaults")
	}
	small := ContainerUpdate{CPURequest: 50, CPULimit: 100, MemoryRequest: 128, MemoryLimit: 512}
	if AboveDefaultResources(small) {
		t.Error("less than the defaults is allowed on every plan")
	}
	for _, u := range []ContainerUpdate{
		{CPURequest: 100, CPULimit: 200, MemoryRequest: 350, MemoryLimit: 1024},
		{CPURequest: 100, CPULimit: 100, MemoryRequest: 351, MemoryLimit: 1024},
		{CPURequest: 100, CPULimit: 100, MemoryRequest: 350, MemoryLimit: 2048},
	} {
		if !AboveDefaultResources(u) {
			t.Errorf("%+v is above the defaults", u)
		}
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
	m := BuildMetrics(res, map[string][]platform.MetricSample{})
	if m.HTTPAvailable || len(m.RequestRows) != 0 || len(m.ErrorRows) != 0 {
		t.Fatalf("no HTTP data: %+v", m)
	}
	if len(m.CPURows) != 2 || m.CPURows[0]["usage"] != 0.0123 || m.CPURows[1]["time"] != t1.Format(time.RFC3339) {
		t.Fatalf("cpu rows = %v", m.CPURows)
	}
	if m.MemoryRows[0]["usage"] != 4.0 || m.MemoryRows[0]["limit"] != 2048.0 {
		t.Fatalf("memory rows = %v", m.MemoryRows)
	}
	http := map[string][]platform.MetricSample{
		"requestCount": s(10, 0), "successfulRequestCount": s(9, 0), "unsuccessfulRequestCount": s(1, 0),
		"latencyP50": s(0.012, 0), "latencyP90": s(0.05, 0), "latencyP99": s(0.1234, 0),
	}
	m = BuildMetrics(res, http)
	if !m.HTTPAvailable || m.ErrorRows[0]["errorRate"] != 10.0 || m.ErrorRows[1]["errorRate"] != 0.0 {
		t.Fatalf("error rows = %v", m.ErrorRows)
	}
	if m.LatencyRows[0]["p99"] != 123.4 || m.RequestRows[0]["success"] != 9.0 {
		t.Fatalf("latency %v requests %v", m.LatencyRows, m.RequestRows)
	}
}

// TestSinglePodUsage: a lone pod gets the environment's usage; replicas too.
func TestSinglePodUsage(t *testing.T) {
	e := newTestEnv(t)
	now := time.Now()
	e.logs.metrics = map[string]map[string][]platform.MetricSample{"resource": {
		"cpuUsage": {{Time: now, Value: 0.0254}}, "memoryUsage": {{Time: now, Value: 12 * mib}},
	}}
	pods := []Pod{{Name: "p1", Phase: "Running"}}
	e.svc.fillSinglePodUsage(e.ctx, track{Name: "site", Project: "default"}, "development", pods)
	if pods[0].CPUUsageMillicores == nil || *pods[0].CPUUsageMillicores != 25 || pods[0].MemoryUsageBytes == nil || *pods[0].MemoryUsageBytes != 12*mib {
		t.Fatalf("pod = %+v", pods[0])
	}
	two := []Pod{{Name: "p1", Phase: "Running"}, {Name: "p2", Phase: "Running"}}
	e.svc.fillSinglePodUsage(e.ctx, track{Name: "site"}, "development", two)
	if two[0].CPUUsageMillicores != nil {
		t.Fatal("per-pod usage is unknown with several pods")
	}
}

func TestBuildOfRelease(t *testing.T) {
	for in, want := range map[string]string{"site-261008-ab": "site-261008-ab", "site-261008-ab--r3": "site-261008-ab", "site-img-261008-ab--r12": "site-img-261008-ab", "site--main-1": "site--main-1"} {
		if got := buildOfRelease(in); got != want {
			t.Errorf("buildOfRelease(%q) = %q", in, got)
		}
	}
}
