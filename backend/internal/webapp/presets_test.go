package webapp

import "testing"

func TestWorkflowFor(t *testing.T) {
	cases := []struct {
		name     string
		in       BuildSpec
		kind     string
		workflow string
		check    func(t *testing.T, p map[string]any)
	}{
		{"react", BuildSpec{Preset: PresetReact, RepoURL: "https://github.com/a/b", Branch: "main", AppPath: "/", BuildCommand: "npm run build", OutputDir: "/build", NodeVersion: "18"},
			"Workflow", "web-app-hosting-spa-builder", func(t *testing.T, p map[string]any) {
				spa := p["spa"].(map[string]any)
				if spa["outputDir"] != "build" || spa["buildCommand"] != "npm run build" || spa["nodeVersion"] != "18" {
					t.Errorf("spa = %v", spa)
				}
				if p["repository"].(map[string]any)["appPath"] != "." {
					t.Errorf("appPath = %v", p["repository"])
				}
			}},
		{"static clears build command", BuildSpec{Preset: PresetStatic, RepoURL: "u", Branch: "main", AppPath: "site", BuildCommand: "npm run build"},
			"Workflow", "web-app-hosting-spa-builder", func(t *testing.T, p map[string]any) {
				spa := p["spa"].(map[string]any)
				if spa["buildCommand"] != "" || spa["outputDir"] != "." {
					t.Errorf("spa = %v", spa)
				}
			}},
		{"node via paketo with port", BuildSpec{Preset: PresetNode, RepoURL: "u", Branch: "dev", Port: 3000, NodeVersion: "20"},
			"ClusterWorkflow", "paketo-buildpacks-builder", func(t *testing.T, p map[string]any) {
				env := p["buildEnv"].([]any)
				if len(env) != 2 || env[0].(map[string]any)["value"] != "3000" {
					t.Errorf("buildEnv = %v", env)
				}
			}},
		{"docker", BuildSpec{Preset: PresetDocker, RepoURL: "u", Branch: "main", AppPath: "svc/"},
			"ClusterWorkflow", "dockerfile-builder", func(t *testing.T, p map[string]any) {
				d := p["docker"].(map[string]any)
				if d["context"] != "svc" || d["filePath"] != "svc/Dockerfile" {
					t.Errorf("docker = %v", d)
				}
			}},
		{"docker root", BuildSpec{Preset: PresetDocker, RepoURL: "u", Branch: "main", AppPath: "/"},
			"ClusterWorkflow", "dockerfile-builder", func(t *testing.T, p map[string]any) {
				if d := p["docker"].(map[string]any); d["filePath"] != "Dockerfile" {
					t.Errorf("docker = %v", d)
				}
			}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			wf, err := WorkflowFor(c.in)
			if err != nil {
				t.Fatal(err)
			}
			if wf.Kind != c.kind || wf.Name != c.workflow {
				t.Fatalf("got %s/%s", wf.Kind, wf.Name)
			}
			c.check(t, wf.Parameters)
		})
	}
	if _, err := WorkflowFor(BuildSpec{Preset: "cobol"}); err == nil {
		t.Error("expected error for unknown preset")
	}
}

func TestRuntimePort(t *testing.T) {
	if RuntimePort(PresetVue, 3000) != 8080 || RuntimePort(PresetPython, 5000) != 5000 || RuntimePort(PresetGo, 0) != 8080 {
		t.Error("unexpected runtime port")
	}
}

func TestSlugAndNames(t *testing.T) {
	if got := Slug("main", 20); got != "main" {
		t.Errorf("Slug(main) = %q", got)
	}
	a, b := Slug("feature/Login", 20), Slug("feature-login", 20)
	if a == b || !ValidHandle(a) {
		t.Errorf("slugs should differ and be valid: %q %q", a, b)
	}
	if long := Slug("a-very-long-branch-name-that-goes-on-and-on", 20); len(long) > 20 || !ValidHandle(long) {
		t.Errorf("long slug %q", long)
	}
	if TrackComponentName("shop", "main", true) != "shop" || TrackComponentName("shop", "dev", false) != "shop-dev" {
		t.Error("track names")
	}
}
