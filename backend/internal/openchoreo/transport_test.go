package openchoreo

import (
	"context"
	"net/http"
	"testing"
)

type staticTokens struct{}

func (staticTokens) Token() (string, error) { return "svc-token", nil }
func (staticTokens) Invalidate()            {}

// TestAuthRequestEditorHost: the PAS internal gateway routes by virtual host,
// so a configured Host overrides the BaseURL host; empty leaves it alone.
func TestAuthRequestEditorHost(t *testing.T) {
	for _, host := range []string{"dev-wso2cloud.gateway.example.com", ""} {
		req, _ := http.NewRequest(http.MethodGet, "http://internal-gw/pas/api/v1/namespaces", nil)
		edit := authRequestEditor(Config{ServiceTokens: staticTokens{}, Host: host})
		if err := edit(context.Background(), req); err != nil {
			t.Fatal(err)
		}
		want := host
		if want == "" {
			want = "internal-gw"
		}
		if got := req.Host; got != want {
			t.Fatalf("Host = %q, want %q", got, want)
		}
	}
}
