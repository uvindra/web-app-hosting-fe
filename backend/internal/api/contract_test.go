package api

import (
	"os"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// TestRoutesMatchOpenAPI keeps the router and api/openapi.yaml in sync.
func TestRoutesMatchOpenAPI(t *testing.T) {
	raw, err := os.ReadFile("../../api/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	inSpec := map[string]bool{}
	for p, ops := range spec.Paths {
		for m := range ops {
			inSpec[strings.ToUpper(m)+" "+p] = true
		}
	}
	inRouter := map[string]bool{}
	for _, r := range Routes {
		inRouter[r.Method+" "+r.Path] = true
	}
	var missing, extra []string
	for k := range inRouter {
		if !inSpec[k] {
			missing = append(missing, k)
		}
	}
	for k := range inSpec {
		if !inRouter[k] {
			extra = append(extra, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing) > 0 || len(extra) > 0 {
		t.Fatalf("router/openapi drift:\n  routes missing from spec: %v\n  spec operations without a route: %v", missing, extra)
	}
}
