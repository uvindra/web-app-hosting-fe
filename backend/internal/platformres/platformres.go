// Package platformres renders the platform resources the BFF upserts into
// every org's namespace on first use (D9): our ComponentType
// `deployment/web-app-hosting` and the namespaced SPA workflow
// `web-app-hosting-spa-builder`.
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
const Version = 1

const (
	ComponentTypeName = "web-app-hosting"
	// ComponentTypeRef is the `componentType.name` used on Components.
	ComponentTypeRef = "deployment/web-app-hosting"
	SPAWorkflowName  = "web-app-hosting-spa-builder"
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
}

// ComponentType returns the ComponentType body.
func ComponentType(p Profile) (map[string]any, error) {
	return render("componenttype.yaml.tmpl", p)
}

// SPAWorkflow returns the namespaced SPA/static Workflow body.
func SPAWorkflow(p Profile) (map[string]any, error) {
	return render("spa-workflow.yaml.tmpl", p)
}

func render(name string, p Profile) (map[string]any, error) {
	raw, err := templates.ReadFile("templates/" + name)
	if err != nil {
		return nil, err
	}
	t, err := template.New(name).Delims("[[", "]]").Option("missingkey=error").Parse(string(raw))
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", name, err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data{Version: Version, Cloud: p.Cloud, RegistryPullSecret: p.Cloud}); err != nil {
		return nil, fmt.Errorf("render %s: %w", name, err)
	}
	var out map[string]any
	if err := yaml.Unmarshal(buf.Bytes(), &out); err != nil {
		return nil, fmt.Errorf("decode %s: %w", name, err)
	}
	return out, nil
}
