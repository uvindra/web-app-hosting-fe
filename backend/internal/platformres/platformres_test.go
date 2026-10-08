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

// The inline shell step must not contain ${...} (OpenChoreo renders it as CEL)
// or Argo {{...}} of its own.
func TestSPAScriptHasNoTemplateSyntax(t *testing.T) {
	wf, err := SPAWorkflow(Profile{})
	if err != nil {
		t.Fatal(err)
	}
	tmpls := wf["spec"].(map[string]any)["runTemplate"].(map[string]any)["spec"].(map[string]any)["templates"].([]any)
	found := false
	for _, tt := range tmpls {
		m := tt.(map[string]any)
		if m["name"] != "generate-spa-files" {
			continue
		}
		found = true
		src := m["script"].(map[string]any)["source"].(string)
		if strings.Contains(src, "${") || strings.Contains(src, "{{") {
			t.Fatalf("script contains template syntax")
		}
	}
	if !found {
		t.Fatal("generate-spa-files template not found")
	}
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
