package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
	"github.com/wso2/web-app-hosting/backend/internal/webapp"
)

// fakePAS is an in-memory stand-in for the OC-shaped platform API
// (/api/v1/namespaces/{ns}/...), recording every write.
type fakePAS struct {
	mu         sync.Mutex
	writes     []recorded
	projects   []map[string]any
	components []map[string]any
	quotaFull  bool
	// gets counts GET requests by path (query stripped).
	gets map[string]int
	// svc is the service under test (set by newTestServer).
	svc *webapp.Service
	// runDelay slows down WorkflowRun creation (a loaded cluster).
	runDelay time.Duration
	// ghRateLimited makes the fake GitHub answer every call with a rate limit.
	ghRateLimited bool
}

// resetGets clears the GET counters.
func (f *fakePAS) resetGets() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets = map[string]int{}
}

// totalGets returns the number of GETs since the last reset.
func (f *fakePAS) totalGets() (int, map[string]int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	cp := map[string]int{}
	for k, v := range f.gets {
		n += v
		cp[k] = v
	}
	return n, cp
}

type recorded struct {
	Method, Path string
	Body         map[string]any
}

func (f *fakePAS) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/workflowruns") && f.runDelay > 0 {
		time.Sleep(f.runDelay)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	var body map[string]any
	if r.Body != nil {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
	}
	if r.Method != http.MethodGet {
		f.writes = append(f.writes, recorded{r.Method, r.URL.Path, body})
	} else {
		if f.gets == nil {
			f.gets = map[string]int{}
		}
		f.gets[r.URL.Path]++
	}
	p := strings.TrimPrefix(r.URL.Path, "/api/v1/namespaces/org-ns/")
	now := time.Now().UTC().Format(time.RFC3339)
	stamp := func(b map[string]any) map[string]any {
		b["metadata"].(map[string]any)["creationTimestamp"] = now
		return b
	}
	list := func(items []map[string]any) {
		writeJSON(w, 200, map[string]any{"items": items, "pagination": map[string]any{}})
	}
	switch {
	case r.Method == "GET" && p == "projects":
		list(f.projects)
	case r.Method == "POST" && p == "projects":
		f.projects = append(f.projects, stamp(body))
		writeJSON(w, 201, body)
	case r.Method == "GET" && strings.HasPrefix(p, "projects/"):
		for _, pr := range f.projects {
			if pr["metadata"].(map[string]any)["name"] == strings.TrimPrefix(p, "projects/") {
				writeJSON(w, 200, pr)
				return
			}
		}
		writeJSON(w, 404, map[string]any{"error": "project not found"})
	case r.Method == "GET" && p == "environments":
		list([]map[string]any{{"metadata": map[string]any{"name": "development"}}, {"metadata": map[string]any{"name": "production"}}})
	case r.Method == "GET" && p == "deploymentpipelines/default":
		writeJSON(w, 200, map[string]any{"metadata": map[string]any{"name": "default"}, "spec": map[string]any{"promotionPaths": []any{
			map[string]any{"sourceEnvironmentRef": map[string]any{"name": "development"}, "targetEnvironmentRefs": []any{map[string]any{"name": "production"}}}}}})
	case r.Method == "POST" && (p == "componenttypes" || p == "workflows"):
		writeJSON(w, 201, body)
	case r.Method == "GET" && p == "components":
		sel := r.URL.Query().Get("labelSelector")
		var out []map[string]any
		for _, c := range f.components {
			labels, _ := c["metadata"].(map[string]any)["labels"].(map[string]any)
			k, v, hasV := strings.Cut(sel, "=")
			if lv, ok := labels[k]; ok && (!hasV || lv == v) {
				out = append(out, c)
			}
		}
		list(out)
	case r.Method == "POST" && p == "components":
		if f.quotaFull {
			writeJSON(w, 402, map[string]any{"success": false, "error": "Quota exceeded for web_app_tracks on the free plan"})
			return
		}
		f.components = append(f.components, stamp(body))
		writeJSON(w, 201, body)
	case r.Method == "GET" && strings.HasPrefix(p, "components/"):
		for _, c := range f.components {
			if c["metadata"].(map[string]any)["name"] == strings.TrimPrefix(p, "components/") {
				writeJSON(w, 200, c)
				return
			}
		}
		writeJSON(w, 404, map[string]any{"error": "not found"})
	case r.Method == "POST" && p == "workflowruns":
		writeJSON(w, 201, stamp(body))
	case r.Method == "GET" && (p == "releasebindings" || p == "workflowruns"):
		list(nil)
	default:
		writeJSON(w, 404, map[string]any{"error": "unhandled " + r.Method + " " + p})
	}
}

type staticTokens struct{}

func (staticTokens) Token() (string, error) { return "svc-token", nil }
func (staticTokens) Invalidate()            {}

func newTestServer(t *testing.T, pas *fakePAS) (*httptest.Server, *httptest.Server) {
	t.Helper()
	ocSrv := httptest.NewServer(pas)
	gh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if pas.ghRateLimited {
			w.Header().Set("X-RateLimit-Remaining", "0")
			writeJSON(w, 403, map[string]any{"message": "API rate limit exceeded"})
			return
		}
		if strings.HasSuffix(r.URL.Path, "/branches") {
			writeJSON(w, 200, []any{map[string]any{"name": "main"}, map[string]any{"name": "b1"}, map[string]any{"name": "b2"}, map[string]any{"name": "b3"}, map[string]any{"name": "b4"}})
			return
		}
		writeJSON(w, 200, map[string]any{"sha": "abc123", "commit": map[string]any{"message": "init\nbody", "author": map[string]any{"name": "dev", "date": "2026-10-07T09:00:00Z"}}})
	}))
	oc, err := openchoreo.New(openchoreo.Config{
		BaseURL: ocSrv.URL, ServiceTokens: staticTokens{}, Strategy: openchoreo.ServiceOnlyStrategy,
		ResourceLabels: map[string]string{webapp.LabelProduct: webapp.ProductName},
		Retry:          openchoreo.RequestRetryConfig{RetryAttemptsMax: 1, RetryWaitMin: time.Millisecond, RetryWaitMax: time.Millisecond},
	})
	if err != nil {
		t.Fatal(err)
	}
	pl := &platform.Platform{
		Target: "openchoreo", Org: platform.StaticOrgResolver{Namespace: "org-ns", Handle: "acme"},
		Git: &platform.PublicGitHub{APIURL: gh.URL},
	}
	svc := webapp.New(oc, pl, webapp.Options{Profile: platformres.Profile{}, DefaultProject: "default", WatchInterval: time.Hour})
	pas.svc = svc
	api := httptest.NewServer((&Server{BasePath: "/webapp-hosting/api/v1", Service: svc, Auth: DevAuthenticator{}, Orgs: pl.Org}).Handler())
	t.Cleanup(func() { api.Close(); ocSrv.Close(); gh.Close() })
	return api, ocSrv
}

func call(t *testing.T, srv *httptest.Server, method, path string, body any) (int, map[string]any, []any) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, srv.URL+"/webapp-hosting/api/v1"+path, rdr)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var obj map[string]any
	var arr []any
	if json.Unmarshal(raw, &obj) != nil {
		_ = json.Unmarshal(raw, &arr)
	}
	return resp.StatusCode, obj, arr
}

var createInput = map[string]any{
	"sourceType": "public-git", "repository": "https://github.com/acme/site", "branch": "main", "componentDirectory": "/",
	"displayName": "Site", "handler": "site", "buildPreset": "react", "buildCommand": "npm run build", "buildPath": "/dist", "port": 8080,
}

func TestCreateWebAppFlow(t *testing.T) {
	pas := &fakePAS{}
	srv, _ := newTestServer(t, pas)

	// First login: the default project is created.
	code, _, arr := call(t, srv, "GET", "/projects", nil)
	if code != 200 || len(arr) != 1 || arr[0].(map[string]any)["id"] != "default" {
		t.Fatalf("projects: %d %v", code, arr)
	}

	code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", createInput)
	if code != 201 || obj["id"] != "site" || obj["defaultTrackId"] != "site" || obj["framework"] != "React" {
		t.Fatalf("create: %d %v", code, obj)
	}
	pas.svc.WaitBackground() // the first build starts in the background

	pas.mu.Lock()
	defer pas.mu.Unlock()
	seen := map[string]recorded{}
	for _, w := range pas.writes {
		seen[w.Method+" "+strings.TrimPrefix(w.Path, "/api/v1/namespaces/org-ns/")] = w
	}
	for _, k := range []string{"POST projects", "POST workflows", "POST componenttypes", "POST components", "POST workflowruns"} {
		w, ok := seen[k]
		if !ok {
			t.Fatalf("missing write %s (have %v)", k, pas.writes)
		}
		labels := w.Body["metadata"].(map[string]any)["labels"].(map[string]any)
		if labels[webapp.LabelProduct] != webapp.ProductName {
			t.Errorf("%s: product label missing: %v", k, labels)
		}
	}
	comp := seen["POST components"].Body
	spec := comp["spec"].(map[string]any)
	if spec["componentType"].(map[string]any)["name"] != "deployment/web-app-hosting" || spec["workflow"].(map[string]any)["name"] != "web-app-hosting-spa-builder" {
		t.Errorf("component spec = %v", spec)
	}
	run := seen["POST workflowruns"].Body
	rl := run["metadata"].(map[string]any)["labels"].(map[string]any)
	if rl["openchoreo.dev/component"] != "site" || rl["openchoreo.dev/project"] != "default" {
		t.Errorf("run labels = %v", rl)
	}
	params := run["spec"].(map[string]any)["workflow"].(map[string]any)["parameters"].(map[string]any)
	if params["repository"].(map[string]any)["revision"].(map[string]any)["commit"] != "abc123" {
		t.Errorf("run params = %v", params)
	}
}

func TestQuotaExceededMapsTo402(t *testing.T) {
	pas := &fakePAS{quotaFull: true}
	srv, _ := newTestServer(t, pas)
	call(t, srv, "GET", "/projects", nil)
	code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", createInput)
	if code != http.StatusPaymentRequired || obj["code"] != "QUOTA_EXCEEDED" || !strings.Contains(obj["message"].(string), "Quota exceeded") {
		t.Fatalf("got %d %v", code, obj)
	}
}

func TestErrorMapping(t *testing.T) {
	pas := &fakePAS{}
	srv, _ := newTestServer(t, pas)
	if code, obj, _ := call(t, srv, "GET", "/webapps/nope/tracks", nil); code != 404 || obj["code"] != "NOT_FOUND" {
		t.Fatalf("unknown web app: %d %v", code, obj)
	}
	if code, obj, _ := call(t, srv, "GET", "/projects/missing", nil); code != 404 || obj["code"] != "NOT_FOUND" {
		t.Fatalf("unknown project: %d %v", code, obj)
	}
	call(t, srv, "GET", "/projects", nil)
	bad := map[string]any{}
	for k, v := range createInput {
		bad[k] = v
	}
	bad["handler"] = "Bad_Name"
	if code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", bad); code != 400 || obj["code"] != "BAD_REQUEST" {
		t.Fatalf("bad handle: %d %v", code, obj)
	}
	call(t, srv, "POST", "/projects/default/webapps", createInput)
	if code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", createInput); code != 409 || obj["code"] != "CONFLICT" {
		t.Fatalf("duplicate: %d %v", code, obj)
	}
}

func TestJWTRequired(t *testing.T) {
	srv := httptest.NewServer((&Server{BasePath: "/b", Auth: JWTAuthenticator{}, Orgs: platform.StaticOrgResolver{}}).Handler())
	defer srv.Close()
	resp, err := http.Get(srv.URL + "/b/projects")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if resp, _ := http.Get(srv.URL + "/health"); resp.StatusCode != 200 {
		t.Fatalf("health = %d", resp.StatusCode)
	}
}

func TestStatusMapping(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{&platform.RateLimitError{}, http.StatusTooManyRequests, "GIT_RATE_LIMITED"},
		{fmt.Errorf("list branches: %w", &platform.RateLimitError{}), http.StatusTooManyRequests, "GIT_RATE_LIMITED"},
		{fmt.Errorf("create component: %w", context.DeadlineExceeded), http.StatusGatewayTimeout, "UPSTREAM_TIMEOUT"},
		{openchoreo.NewAPIError(500, []byte(`{"error":"boom"}`)), http.StatusBadGateway, "UPSTREAM_ERROR"},
	}
	for _, c := range cases {
		if s, code := Status(c.err); s != c.status || code != c.code {
			t.Errorf("Status(%v) = %d %s, want %d %s", c.err, s, code, c.status, c.code)
		}
	}
}

// TestListCallsAreConstant proves the list endpoints the console polls make
// O(1) upstream calls per request, not one (or more) per item.
func TestListCallsAreConstant(t *testing.T) {
	measure := func(t *testing.T, apps, tracks int) (webApps, projects, trackList int) {
		pas := &fakePAS{}
		srv, _ := newTestServer(t, pas)
		call(t, srv, "GET", "/projects", nil)
		for i := range apps {
			in := map[string]any{}
			for k, v := range createInput {
				in[k] = v
			}
			in["handler"] = fmt.Sprintf("site%d", i)
			if code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", in); code != 201 {
				t.Fatalf("create: %d %v", code, obj)
			}
		}
		for i := 1; i <= tracks; i++ {
			if code, obj, _ := call(t, srv, "POST", "/webapps/site0/tracks", map[string]any{"branch": fmt.Sprintf("b%d", i)}); code != 201 {
				t.Fatalf("create track: %d %v", code, obj)
			}
		}
		pas.svc.WaitBackground()
		count := func(path string, n int) int {
			pas.resetGets()
			code, _, arr := call(t, srv, "GET", path, nil)
			if code != 200 || len(arr) != n {
				t.Fatalf("GET %s: %d, %d items", path, code, len(arr))
			}
			got, by := pas.totalGets()
			t.Logf("GET %s (%d items): %d upstream GETs %v", path, n, got, by)
			return got
		}
		return count("/projects/default/webapps", apps), count("/projects", 1), count("/webapps/site0/tracks", tracks+1)
	}
	w1, p1, t1 := measure(t, 1, 0)
	w5, p5, t5 := measure(t, 5, 3)
	if w1 != w5 || p1 != p5 || t1 != t5 {
		t.Fatalf("upstream calls grow with items: webapps %d→%d, projects %d→%d, tracks %d→%d", w1, w5, p1, p5, t1, t5)
	}
	if w5 > 5 || p5 > 2 || t5 > 2 {
		t.Fatalf("too many upstream calls: webapps %d, projects %d, tracks %d", w5, p5, t5)
	}
}

// TestCreateReturnsBeforeFirstBuild: web app and track creation answer 201 as
// soon as the Component exists; the first build follows in the background,
// and a rate-limited GitHub doesn't block track creation.
func TestCreateReturnsBeforeFirstBuild(t *testing.T) {
	pas := &fakePAS{runDelay: 400 * time.Millisecond}
	srv, _ := newTestServer(t, pas)
	call(t, srv, "GET", "/projects", nil)

	start := time.Now()
	if code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", createInput); code != 201 {
		t.Fatalf("create: %d %v", code, obj)
	}
	if d := time.Since(start); d > 300*time.Millisecond {
		t.Fatalf("web app create waited for the first build: %s", d)
	}
	pas.mu.Lock()
	pas.ghRateLimited = true
	pas.mu.Unlock()
	start = time.Now()
	code, obj, _ := call(t, srv, "POST", "/webapps/site/tracks", map[string]any{"branch": "b1"})
	if code != 201 || obj["id"] != "site-b1" {
		t.Fatalf("create track: %d %v", code, obj)
	}
	if d := time.Since(start); d > 300*time.Millisecond {
		t.Fatalf("track create waited for the first build: %s", d)
	}
	// Branch lookups surface the rate limit as 429 GIT_RATE_LIMITED.
	if code, obj, _ := call(t, srv, "GET", "/webapps/site/branches", nil); code != 429 || obj["code"] != "GIT_RATE_LIMITED" {
		t.Fatalf("branches: %d %v", code, obj)
	}
	pas.svc.WaitBackground()
	pas.mu.Lock()
	defer pas.mu.Unlock()
	runs := map[string]bool{}
	for _, w := range pas.writes {
		if w.Method == "POST" && strings.HasSuffix(w.Path, "/workflowruns") {
			runs[w.Body["metadata"].(map[string]any)["labels"].(map[string]any)["openchoreo.dev/component"].(string)] = true
		}
	}
	if !runs["site"] || !runs["site-b1"] {
		t.Fatalf("first builds = %v", runs)
	}
}

func TestCreateDockerWebAppUsesDockerFields(t *testing.T) {
	pas := &fakePAS{}
	srv, _ := newTestServer(t, pas)
	call(t, srv, "GET", "/projects", nil)
	in := map[string]any{
		"sourceType": "public-git", "repository": "https://github.com/acme/api", "branch": "main", "componentDirectory": "/svc",
		"displayName": "API", "handler": "api", "buildPreset": "docker", "port": 9000,
		"docker": map[string]any{"filePath": "deploy/Dockerfile", "context": ".."},
	}
	if code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", in); code != 201 {
		t.Fatalf("create: %d %v", code, obj)
	}
	pas.svc.WaitBackground()
	code, cfg, _ := call(t, srv, "GET", "/webapps/api/tracks/api/build-config", nil)
	d, _ := cfg["docker"].(map[string]any)
	if code != 200 || d["filePath"] != "svc/deploy/Dockerfile" || d["context"] != "." || cfg["port"] != float64(9000) {
		t.Fatalf("build-config: %d %v", code, cfg)
	}
	in["handler"], in["docker"] = "api2", map[string]any{"filePath": "../../Dockerfile"}
	if code, obj, _ := call(t, srv, "POST", "/projects/default/webapps", in); code != 400 {
		t.Fatalf("escaping dockerfile: %d %v", code, obj)
	}
}
