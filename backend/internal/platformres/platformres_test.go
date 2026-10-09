package platformres

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
)

func TestRenderBothProfiles(t *testing.T) {
	for _, cloud := range []bool{false, true} {
		ct, err := ComponentType(Profile{Cloud: cloud})
		if err != nil {
			t.Fatalf("ct cloud=%v: %v", cloud, err)
		}
		wf, err := SPAWorkflow(Profile{Cloud: cloud})
		if err != nil {
			t.Fatalf("wf cloud=%v: %v", cloud, err)
		}
		ctJSON, _ := json.Marshal(ct)
		wfJSON, _ := json.Marshal(wf)
		if got := strings.Contains(string(ctJSON), "registry-pull-secret"); got != cloud {
			t.Errorf("ct cloud=%v: registry-pull-secret present=%v", cloud, got)
		}
		if got := strings.Contains(string(wfJSON), "ecr-creds"); got != cloud {
			t.Errorf("wf cloud=%v: ecr-creds present=%v", cloud, got)
		}
		if !strings.Contains(string(ctJSON), `"medium":"Memory"`) && !strings.Contains(string(ctJSON), `\"medium\": \"Memory\"`) {
			t.Errorf("ct cloud=%v: missing in-memory /tmp volume", cloud)
		}
		meta := ct["metadata"].(map[string]any)
		ann := meta["annotations"].(map[string]any)
		container := ctContainer(t, ct)
		if rp, _ := container["readinessProbe"].(string); !strings.Contains(rp, `oc_merge(dyn(environmentConfigs.readinessProbe), {"tcpSocket"`) {
			t.Errorf("ct cloud=%v: readiness probe lacks the default TCP fallback: %q", cloud, rp)
		}
		if lp, _ := container["livenessProbe"].(string); !strings.Contains(lp, "oc_omit()") {
			t.Errorf("ct cloud=%v: liveness probe must be omitted when unset: %q", cloud, lp)
		}
		props := ct["spec"].(map[string]any)["environmentConfigs"].(map[string]any)["openAPIV3Schema"].(map[string]any)["properties"].(map[string]any)
		for _, k := range []string{"livenessProbe", "readinessProbe"} {
			pp := props[k].(map[string]any)["properties"].(map[string]any)
			for _, h := range []string{"httpGet", "tcpSocket", "exec", "successThreshold"} {
				if _, ok := pp[h]; !ok {
					t.Errorf("ct cloud=%v: %s schema lacks %s", cloud, k, h)
				}
			}
		}
		if !strings.Contains(string(ctJSON), `"allowedTraits":[{"kind":"Trait","name":"`+HPATraitName+`"}]`) {
			t.Errorf("ct cloud=%v: HPA trait not allowed", cloud)
		}
		if ann["web-app-hosting.wso2.com/ct-version"] != strconv.Itoa(Version) {
			t.Errorf("version annotation = %v", ann["web-app-hosting.wso2.com/ct-version"])
		}
		if meta["name"] != ComponentTypeName || wf["metadata"].(map[string]any)["name"] != SPAWorkflowName {
			t.Errorf("unexpected names")
		}
	}
}

// Inline shell steps must not contain ${...} (OpenChoreo renders it as CEL)
// or Argo {{...}} of their own.
func TestScriptsHaveNoTemplateSyntax(t *testing.T) {
	for _, cloud := range []bool{false, true} {
		wfs, err := BuildWorkflows(Profile{Cloud: cloud})
		if err != nil {
			t.Fatal(err)
		}
		for _, wf := range wfs {
			scripts := 0
			for _, m := range runTemplates(wf) {
				sc, ok := m["script"].(map[string]any)
				if !ok {
					continue
				}
				scripts++
				if src := sc["source"].(string); strings.Contains(src, "${") || strings.Contains(src, "{{") {
					t.Fatalf("%v: script %v contains template syntax", wfName(wf), m["name"])
				}
			}
			if want := map[string]int{SPAWorkflowName: 2}[wfName(wf)]; scripts != max(want, 1) {
				t.Errorf("%v: %d inline scripts", wfName(wf), scripts)
			}
		}
	}
}

// Every build workflow scans the built image tar with the pinned Trivy before
// publish-image, failing on CRITICAL only and honouring .trivyignore (D15).
func TestBuildWorkflowsScanBeforePublish(t *testing.T) {
	for _, cloud := range []bool{false, true} {
		wfs, err := BuildWorkflows(Profile{Cloud: cloud})
		if err != nil {
			t.Fatal(err)
		}
		names := []string{}
		for _, wf := range wfs {
			names = append(names, wfName(wf))
			tmpls := runTemplates(wf)
			steps := []string{}
			for _, group := range tmpls[0]["steps"].([]any) {
				steps = append(steps, group.([]any)[0].(map[string]any)["name"].(string))
			}
			got := strings.Join(steps, ",")
			want := "checkout-source,build-image," + ScanStepName + ",publish-image,generate-workload-cr"
			if wfName(wf) == SPAWorkflowName {
				want = "checkout-source,generate-spa-files,build-image," + ScanStepName + ",publish-image,generate-workload-cr"
			}
			if got != want {
				t.Errorf("%v steps = %s", wfName(wf), got)
			}
			var scan map[string]any
			for _, m := range tmpls {
				if m["name"] == ScanStepName {
					scan = m["script"].(map[string]any)
				}
			}
			if scan == nil || scan["image"] != TrivyImage || !strings.Contains(TrivyImage, "@sha256:") {
				t.Fatalf("%v: scan step = %v", wfName(wf), scan)
			}
			src := scan["source"].(string)
			for _, s := range []string{"--input \"$IMAGE_TAR\"", "--severity CRITICAL", "--ignorefile \"$IGNORE_FILE\"", "/mnt/vol/source/$APP_PATH/.trivyignore"} {
				if !strings.Contains(src, s) {
					t.Errorf("%v: scan script lacks %s", wfName(wf), s)
				}
			}
			raw, _ := json.Marshal(wf)
			if got := strings.Contains(string(raw), "ecr-creds"); got != cloud {
				t.Errorf("%v cloud=%v: ecr-creds present=%v", wfName(wf), cloud, got)
			}
		}
		if strings.Join(names, ",") != SPAWorkflowName+","+DockerWorkflowName+","+PaketoWorkflowName {
			t.Errorf("workflows = %v", names)
		}
	}
	ct, _ := ComponentType(Profile{})
	raw, _ := json.Marshal(ct["spec"].(map[string]any)["allowedWorkflows"])
	if string(raw) != `[{"kind":"Workflow","name":"`+SPAWorkflowName+`"},{"kind":"Workflow","name":"`+DockerWorkflowName+`"},{"kind":"Workflow","name":"`+PaketoWorkflowName+`"}]` {
		t.Errorf("allowedWorkflows = %s", raw)
	}
}

func TestScannedWorkflow(t *testing.T) {
	for _, c := range []struct{ kind, name, want string }{
		{"ClusterWorkflow", "dockerfile-builder", DockerWorkflowName},
		{"ClusterWorkflow", "paketo-buildpacks-builder", PaketoWorkflowName},
		{"ClusterWorkflow", "gcp-buildpacks-builder", ""},
		{"Workflow", SPAWorkflowName, ""},
	} {
		if got, _ := ScannedWorkflow(c.kind, c.name); got != c.want {
			t.Errorf("%s/%s -> %q", c.kind, c.name, got)
		}
	}
}

func wfName(wf map[string]any) string {
	n, _ := wf["metadata"].(map[string]any)["name"].(string)
	return n
}

func runTemplates(wf map[string]any) []map[string]any {
	out := []map[string]any{}
	for _, tt := range wf["spec"].(map[string]any)["runTemplate"].(map[string]any)["spec"].(map[string]any)["templates"].([]any) {
		out = append(out, tt.(map[string]any))
	}
	return out
}

func ctContainer(t *testing.T, ct map[string]any) map[string]any {
	t.Helper()
	for _, r := range ct["spec"].(map[string]any)["resources"].([]any) {
		m := r.(map[string]any)
		if m["id"] != "deployment" {
			continue
		}
		spec := m["template"].(map[string]any)["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)
		return spec["containers"].([]any)[0].(map[string]any)
	}
	t.Fatal("deployment resource not found")
	return nil
}

func TestHPATrait(t *testing.T) {
	tr, err := HPATrait(Profile{})
	if err != nil {
		t.Fatal(err)
	}
	meta := tr["metadata"].(map[string]any)
	if meta["name"] != HPATraitName || meta["annotations"].(map[string]any)["web-app-hosting.wso2.com/ct-version"] != strconv.Itoa(Version) {
		t.Fatalf("metadata = %v", meta)
	}
	spec := tr["spec"].(map[string]any)
	props := spec["environmentConfigs"].(map[string]any)["openAPIV3Schema"].(map[string]any)["properties"].(map[string]any)
	if props["enabled"].(map[string]any)["default"] != false {
		t.Error("the trait must be disabled by default (it is attached to every track)")
	}
	if props["maxReplicas"].(map[string]any)["maximum"] != 5 {
		t.Error("maxReplicas must be capped at 5")
	}
	raw, _ := json.Marshal(spec)
	for _, want := range []string{`"op":"remove","path":"/spec/replicas"`, `"where":"${environmentConfigs.enabled}"`, "HorizontalPodAutoscaler", "memoryUtilization", "cpuUtilization"} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("trait lacks %s", want)
		}
	}
}
