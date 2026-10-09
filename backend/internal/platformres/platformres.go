// Package platformres renders the platform resources the BFF upserts into
// every org's namespace on first use (D9): our ComponentType
// `deployment/web-app-hosting`, the namespaced build workflows
// (`web-app-hosting-spa-builder` and the security-scanning copies of the
// shared Dockerfile and Paketo builders, D15) and the autoscaling Trait
// `web-app-hosting-hpa`.
package platformres

import (
	"bytes"
	"embed"
	"fmt"
	"text/template"

	"gopkg.in/yaml.v3"
)

// Version is the shipped version of the ComponentType + workflow. Bump it on
// every template change: orgs whose stored version is lower are upgraded on
// their next web-app create.
// v2: default TCP readiness probe.
// v3: liveness/readiness probe passthrough, private-registry pull secret,
// HPA Trait (allowedTraits).
// v4: Trivy security scan step in every build workflow; namespaced
// web-app-hosting-dockerfile-builder / web-app-hosting-paketo-builder replace
// the shared ClusterWorkflows in allowedWorkflows (D15).
const Version = 4

const (
	ComponentTypeName = "web-app-hosting"
	// ComponentTypeRef is the `componentType.name` used on Components.
	ComponentTypeRef = "deployment/web-app-hosting"
	SPAWorkflowName  = "web-app-hosting-spa-builder"
	// DockerWorkflowName and PaketoWorkflowName are our scanning copies of
	// the shared ClusterWorkflows dockerfile-builder and
	// paketo-buildpacks-builder.
	DockerWorkflowName = "web-app-hosting-dockerfile-builder"
	PaketoWorkflowName = "web-app-hosting-paketo-builder"
	// ScanStepName is the security-scan step of every build workflow.
	ScanStepName = "security-scan"
	// TrivyImage is the pinned scanner image (0.74.0, multi-arch index digest).
	TrivyImage = "aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969"
	// HPATraitName is our namespaced autoscaling Trait; HPATraitInstance is
	// its instance name on every track Component (the key of the binding's
	// traitEnvironmentConfigs).
	HPATraitName     = "web-app-hosting-hpa"
	HPATraitInstance = "hpa"
)

// Profile selects target-specific details.
type Profile struct {
	// Cloud renders the WSO2 Cloud (OC 1.2.5) variant: ECR push/pull secrets,
	// metering labels, `ci` storage class and the cloud generate-workload args.
	Cloud bool
}

//go:embed templates/*.tmpl
var templates embed.FS

type data struct {
	Version            int
	Cloud              bool
	RegistryPullSecret bool
	// Build workflow only: builder variant ("spa", "docker", "paketo") and name.
	Builder    string
	Name       string
	TrivyImage string
}

// ComponentType returns the ComponentType body.
func ComponentType(p Profile) (map[string]any, error) {
	return render("componenttype.yaml.tmpl", p)
}

// HPATrait returns the namespaced autoscaling Trait body.
func HPATrait(p Profile) (map[string]any, error) {
	return render("hpa-trait.yaml.tmpl", p)
}

// SPAWorkflow returns the namespaced SPA/static Workflow body.
func SPAWorkflow(p Profile) (map[string]any, error) {
	return renderWorkflow("spa", SPAWorkflowName, p)
}

// BuildWorkflows returns every namespaced build Workflow body: the SPA
// workflow and the scanning Dockerfile and Paketo builders.
func BuildWorkflows(p Profile) ([]map[string]any, error) {
	out := []map[string]any{}
	for _, b := range []struct{ builder, name string }{{"spa", SPAWorkflowName}, {"docker", DockerWorkflowName}, {"paketo", PaketoWorkflowName}} {
		wf, err := renderWorkflow(b.builder, b.name, p)
		if err != nil {
			return nil, err
		}
		out = append(out, wf)
	}
	return out, nil
}

// ScannedWorkflow maps a shared ClusterWorkflow a web app may still reference
// (created before v4) to our scanning copy; ok is false for any other ref.
func ScannedWorkflow(kind, name string) (string, bool) {
	if kind != "ClusterWorkflow" {
		return "", false
	}
	switch name {
	case "dockerfile-builder":
		return DockerWorkflowName, true
	case "paketo-buildpacks-builder":
		return PaketoWorkflowName, true
	}
	return "", false
}

func renderWorkflow(builder, name string, p Profile) (map[string]any, error) {
	return renderData("build-workflow.yaml.tmpl", data{Version: Version, Cloud: p.Cloud, Builder: builder, Name: name, TrivyImage: TrivyImage})
}

func render(name string, p Profile) (map[string]any, error) {
	return renderData(name, data{Version: Version, Cloud: p.Cloud, RegistryPullSecret: p.Cloud})
}

func renderData(name string, d data) (map[string]any, error) {
	raw, err := templates.ReadFile("templates/" + name)
	if err != nil {
		return nil, err
	}
	t, err := template.New(name).Delims("[[", "]]").Option("missingkey=error").Parse(string(raw))
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", name, err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, d); err != nil {
		return nil, fmt.Errorf("render %s: %w", name, err)
	}
	var out map[string]any
	if err := yaml.Unmarshal(buf.Bytes(), &out); err != nil {
		return nil, fmt.Errorf("decode %s: %w", name, err)
	}
	return out, nil
}
