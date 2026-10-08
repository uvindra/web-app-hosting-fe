package platform

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

func TestPublicGitHubCachesResponses(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		switch r.URL.Path {
		case "/repos/acme/site/branches":
			_, _ = w.Write([]byte(`[{"name":"main"},{"name":"dev"}]`))
		case "/repos/acme/site/commits/main":
			_, _ = w.Write([]byte(`{"sha":"abc","commit":{"message":"m","author":{"name":"a","date":"2026-10-08T00:00:00Z"}}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"message":"Not Found"}`))
		}
	}))
	defer srv.Close()
	now := time.Now()
	g := &PublicGitHub{APIURL: srv.URL, now: func() time.Time { return now }}
	ref := RepoRef{URL: "https://github.com/acme/site", Branch: "main"}
	ctx := context.Background()

	for range 3 {
		b, err := g.ListBranches(ctx, ref)
		if err != nil || len(b) != 2 {
			t.Fatalf("branches = %v, %v", b, err)
		}
		if _, err := g.LatestCommit(ctx, ref, "", ""); err != nil {
			t.Fatal(err)
		}
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("upstream calls = %d, want 2 (cached)", n)
	}
	// 404s are cached too (a mistyped repository URL).
	missing := RepoRef{URL: "https://github.com/acme/nope"}
	for range 2 {
		if _, err := g.ListBranches(ctx, missing); !errors.Is(err, openchoreo.ErrNotFound) {
			t.Fatalf("missing repo err = %v", err)
		}
	}
	if n := calls.Load(); n != 3 {
		t.Fatalf("upstream calls = %d, want 3", n)
	}
	// Fresh reads bypass the cache; expiry refetches.
	if _, err := g.LatestCommit(WithFreshReads(ctx), ref, "", ""); err != nil || calls.Load() != 4 {
		t.Fatalf("fresh read: calls = %d, err = %v", calls.Load(), err)
	}
	now = now.Add(DefaultGitHubCacheTTL + time.Second)
	if _, err := g.ListBranches(ctx, ref); err != nil || calls.Load() != 5 {
		t.Fatalf("after expiry: calls = %d, err = %v", calls.Load(), err)
	}
}

func TestPublicGitHubRateLimit(t *testing.T) {
	reset := time.Now().Add(30 * time.Minute).Unix()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(reset, 10))
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"API rate limit exceeded for 1.2.3.4."}`))
	}))
	defer srv.Close()
	g := &PublicGitHub{APIURL: srv.URL}
	ref := RepoRef{URL: "https://github.com/acme/site", Branch: "main"}
	_, err := g.ListBranches(context.Background(), ref)
	var rl *RateLimitError
	if !errors.Is(err, ErrRateLimited) || !errors.As(err, &rl) || rl.Reset.Unix() != reset {
		t.Fatalf("err = %v", err)
	}
	// Rate limits are not cached.
	_, _ = g.ListBranches(context.Background(), ref)
	if calls.Load() != 2 {
		t.Fatalf("calls = %d", calls.Load())
	}
	// A plain 403 (e.g. a private repository) is not a rate limit.
	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"Resource not accessible"}`))
	}))
	defer plain.Close()
	_, err = (&PublicGitHub{APIURL: plain.URL}).ListBranches(context.Background(), ref)
	if errors.Is(err, ErrRateLimited) || !errors.Is(err, openchoreo.ErrForbidden) {
		t.Fatalf("plain 403 err = %v", err)
	}
}
