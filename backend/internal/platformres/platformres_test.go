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
		if !strings.Contains(string(ctJSON), `"readinessProbe":{"failureThreshold"`) || !strings.Contains(string(ctJSON), "tcpSocket") {
			t.Errorf("ct cloud=%v: missing default readiness probe", cloud)
		}
		if strings.Contains(string(ctJSON), "livenessProbe") {
			t.Errorf("ct cloud=%v: unexpected liveness probe", cloud)
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
