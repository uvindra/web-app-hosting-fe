package webapp

import (
	"fmt"
	"strings"

	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

// Preset is a console build preset (frontend BUILD_PRESETS).
type Preset string

const (
	PresetNode       Preset = "nodejs"
	PresetReact      Preset = "react"
	PresetAngular    Preset = "angular"
	PresetDotnet     Preset = "dotnet"
	PresetVue        Preset = "vuejs"
	PresetPython     Preset = "python"
	PresetGo         Preset = "go"
	PresetRuby       Preset = "ruby"
	PresetPHP        Preset = "php"
	PresetSpringBoot Preset = "springboot"
	PresetStatic     Preset = "static"
	PresetDocker     Preset = "docker"
)

var presetLabels = map[Preset]string{
	PresetNode: "NodeJS", PresetReact: "React", PresetAngular: "Angular", PresetDotnet: ".NET",
	PresetVue: "Vue.js", PresetPython: "Python", PresetGo: "Go", PresetRuby: "Ruby", PresetPHP: "PHP",
	PresetSpringBoot: "Spring Boot", PresetStatic: "Static Site", PresetDocker: "Docker",
}

// Label is the preset's display name.
func (p Preset) Label() string {
	if l, ok := presetLabels[p]; ok {
		return l
	}
	return string(p)
}

// Valid reports whether p is a known preset.
func (p Preset) Valid() bool { _, ok := presetLabels[p]; return ok }

// IsSPA reports whether the preset builds with our SPA/static workflow (D8).
func (p Preset) IsSPA() bool {
	return p == PresetReact || p == PresetAngular || p == PresetVue || p == PresetStatic
}

// SPAPort is the port nginx-unprivileged serves on (D8).
const SPAPort = 8080

// BuildSpec is the preset-independent build input.
type BuildSpec struct {
	Preset       Preset
	RepoURL      string
	Branch       string
	AppPath      string // "." for the repo root
	BuildCommand string
	OutputDir    string
	NodeVersion  string
	Port         int
}

// Workflow is the resolved OpenChoreo workflow for a preset.
type Workflow struct {
	Kind       string // Workflow | ClusterWorkflow
	Name       string
	Parameters map[string]any
}

// NormalizeAppPath maps the console's "/", "", "./x", "/x/" forms to the
// workflow's "." / "x" form.
func NormalizeAppPath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "./")
	p = strings.Trim(p, "/")
	if p == "" || p == "." {
		return "."
	}
	return p
}

// WorkflowFor maps a preset to its workflow + parameters (PLAN_P0 "Preset → workflow").
func WorkflowFor(b BuildSpec) (Workflow, error) {
	if !b.Preset.Valid() {
		return Workflow{}, fmt.Errorf("unknown build preset %q", b.Preset)
	}
	repo := map[string]any{
		"url":       b.RepoURL,
		"secretRef": "",
		"revision":  map[string]any{"branch": b.Branch, "commit": ""},
		"appPath":   NormalizeAppPath(b.AppPath),
	}
	switch {
	case b.Preset.IsSPA():
		cmd, out := strings.TrimSpace(b.BuildCommand), strings.Trim(strings.TrimSpace(b.OutputDir), "/")
		if b.Preset == PresetStatic {
			cmd = "" // static sites are served as is
			if out == "" {
				out = "."
			}
		} else if out == "" {
			out = "build"
		}
		node := strings.TrimSpace(b.NodeVersion)
		if node == "" {
			node = "20"
		}
		return Workflow{Kind: "Workflow", Name: platformres.SPAWorkflowName, Parameters: map[string]any{
			"repository": repo,
			"spa":        map[string]any{"nodeVersion": node, "buildCommand": cmd, "outputDir": out},
		}}, nil
	case b.Preset == PresetDocker:
		ctx := NormalizeAppPath(b.AppPath)
		return Workflow{Kind: "ClusterWorkflow", Name: "dockerfile-builder", Parameters: map[string]any{
			"repository": repo,
			"docker":     map[string]any{"context": ctx, "filePath": strings.TrimPrefix(ctx+"/Dockerfile", "./")},
		}}, nil
	default:
		env := []any{}
		if b.Port > 0 {
			env = append(env, map[string]any{"name": "PORT", "value": fmt.Sprint(b.Port)})
		}
		if b.Preset == PresetNode && strings.TrimSpace(b.NodeVersion) != "" {
			env = append(env, map[string]any{"name": "BP_NODE_VERSION", "value": strings.TrimSpace(b.NodeVersion)})
		}
		return Workflow{Kind: "ClusterWorkflow", Name: "paketo-buildpacks-builder", Parameters: map[string]any{
			"repository": repo,
			"buildEnv":   env,
		}}, nil
	}
}

// RuntimePort is the port the built container listens on.
func RuntimePort(p Preset, requested int) int {
	if p.IsSPA() {
		return SPAPort
	}
	if requested > 0 {
		return requested
	}
	return 8080
}
