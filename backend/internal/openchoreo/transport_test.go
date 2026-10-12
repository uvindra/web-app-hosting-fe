package openchoreo

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
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

type rotatingTokens struct {
	n atomic.Int32
}

func (r *rotatingTokens) Token() (string, error) { return fmt.Sprintf("svc-%d", r.n.Load()), nil }
func (r *rotatingTokens) Invalidate()            { r.n.Add(1) }

// TestRetryAfter401SendsFreshToken: a 401 invalidates the cached service token
// and the retry carries the refetched one, not the token the request was built with.
func TestRetryAfter401SendsFreshToken(t *testing.T) {
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Header.Get("Authorization"))
		if len(seen) == 1 {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	defer srv.Close()
	c, err := newGenClient(Config{BaseURL: srv.URL, ServiceTokens: &rotatingTokens{}, Retry: RequestRetryConfig{RetryWaitMin: time.Millisecond, RetryWaitMax: time.Millisecond}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.ListNamespacesWithResponse(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 2 || seen[0] != "Bearer svc-0" || seen[1] != "Bearer svc-1" {
		t.Fatalf("Authorization per attempt = %v, want [Bearer svc-0 Bearer svc-1]", seen)
	}
}
