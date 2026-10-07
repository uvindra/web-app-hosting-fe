//go:build integration

// Package integration holds the opt-in end-to-end test against a local
// OpenChoreo (k3d-openchoreo). Run: `make integration` from backend/ after
// `make setup-local`. It creates a project + web app from a public sample,
// waits for the build and the auto-deploy to `development`, checks the served
// URL (incl. SPA fallback and a config.js file mount), promotes to `staging`,
// and deletes everything it created.
//
// Env (on top of dev/local.env): WAH_IT_PRESET=static|react (default static —
// fast; react runs the full node build).
package integration

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/app"
	"github.com/wso2/web-app-hosting/backend/internal/config"
	"github.com/wso2/web-app-hosting/backend/internal/oauth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

const base = "/webapp-hosting/api/v1"

type client struct {
	t     *testing.T
	srv   *httptest.Server
	token string
}

func (c *client) do(method, path string, body, out any) int {
	c.t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.srv.URL+base+path, rdr)
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		c.t.Logf("%s %s -> %d %s", method, path, resp.StatusCode, raw)
	}
	if out != nil {
		_ = json.Unmarshal(raw, out)
	}
	return resp.StatusCode
}

func eventually(t *testing.T, what string, timeout, every time.Duration, f func() (bool, string)) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	last := ""
	for time.Now().Before(deadline) {
		ok, msg := f()
		if ok {
			t.Logf("%s: ok (%s)", what, msg)
			return
		}
		if msg != last {
			t.Logf("%s: waiting (%s)", what, msg)
			last = msg
		}
		time.Sleep(every)
	}
	t.Fatalf("%s: timed out (%s)", what, last)
}

// loopbackHTTP dials *.localhost on 127.0.0.1 (RFC 6761), like browsers do.
var loopbackHTTP = &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{
	DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, _ := net.SplitHostPort(addr)
		if strings.HasSuffix(host, ".localhost") {
			addr = net.JoinHostPort("127.0.0.1", port)
		}
		return (&net.Dialer{}).DialContext(ctx, network, addr)
	},
}}

func get(u string) (int, string) {
	resp, err := loopbackHTTP.Get(u)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func TestWebAppLifecycleOnK3d(t *testing.T) {
	cfg, err := config.Load(string(config.TargetOpenChoreo))
	if err != nil {
		t.Skipf("local configuration not loaded (source dev/local.env): %v", err)
	}
	srvCfg, err := app.Build(cfg)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(srvCfg.Handler())
	defer srv.Close()
	tokens := oauth.NewTokenProvider(cfg.TokenURL, cfg.ClientID, cfg.ClientSecret, cfg.TokenScope)
	tok, err := tokens.Token()
	if err != nil {
		t.Fatalf("token: %v", err)
	}
	c := &client{t: t, srv: srv, token: tok}

	var rnd [3]byte
	_, _ = rand.Read(rnd[:])
	suffix := hex.EncodeToString(rnd[:])
	project, handle := "wah-it-"+suffix, "wah-it-"+suffix

	oc, err := openchoreo.New(openchoreo.Config{BaseURL: cfg.OCAPIURL, ServiceTokens: tokens})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanup(t, oc, cfg.OCNamespace, project, handle) })

	if code := c.do("POST", "/projects", map[string]any{"name": "Integration " + suffix, "handler": project}, nil); code != 201 {
		t.Fatalf("create project: %d", code)
	}

	preset := os.Getenv("WAH_IT_PRESET")
	in := map[string]any{
		"sourceType": "public-git", "repository": "https://github.com/wso2/choreo-samples", "branch": "main",
		"componentDirectory": "/react-single-page-app", "displayName": "IT " + suffix, "handler": handle, "port": 8080,
	}
	if preset == "react" {
		in["buildPreset"], in["buildCommand"], in["buildPath"], in["nodeVersion"] = "react", "npm run build", "/build", "18"
	} else {
		in["buildPreset"], in["buildCommand"], in["buildPath"] = "static", "", "/public"
	}
	var wa map[string]any
	if code := c.do("POST", "/projects/"+project+"/webapps", in, &wa); code != 201 {
		t.Fatalf("create web app: %d", code)
	}
	trackPath := fmt.Sprintf("/webapps/%s/tracks/%s", handle, wa["defaultTrackId"])

	eventually(t, "build", 45*time.Minute, 15*time.Second, func() (bool, string) {
		var builds []map[string]any
		c.do("GET", trackPath+"/builds", nil, &builds)
		if len(builds) == 0 {
			return false, "no builds"
		}
		st := builds[0]["status"].(string)
		if st == "failed" {
			var logs map[string]any
			c.do("GET", trackPath+"/builds/"+builds[0]["id"].(string)+"/logs", nil, &logs)
			t.Fatalf("build failed: %v", logs)
		}
		return st == "success", st
	})

	var appURL string
	eventually(t, "auto-deploy to development", 10*time.Minute, 5*time.Second, func() (bool, string) {
		var envs []map[string]any
		c.do("GET", trackPath+"/environments", nil, &envs)
		var urls []map[string]any
		c.do("GET", trackPath+"/urls", nil, &urls)
		for _, u := range urls {
			if u["environment"] == "development" {
				appURL, _ = u["url"].(string)
			}
		}
		if len(envs) == 0 {
			return false, "no environments"
		}
		st, _ := envs[0]["status"].(string)
		return st == "active" && appURL != "", fmt.Sprintf("%v %s", envs[0], appURL)
	})

	eventually(t, "serve index", 3*time.Minute, 5*time.Second, func() (bool, string) {
		code, body := get(appURL + "/")
		return code == 200 && strings.Contains(strings.ToLower(body), "<html"), fmt.Sprint(code)
	})
	if code, body := get(appURL + "/some/deep/link"); code != 200 || !strings.Contains(strings.ToLower(body), "<html") {
		t.Fatalf("SPA fallback: %d", code)
	}

	if code := c.do("POST", trackPath+"/environments/development/configs", map[string]any{
		"name": "runtime-config", "kind": "file", "entries": []any{map[string]any{"key": "config.js", "value": "window.configs={it:'" + suffix + "'};"}},
	}, nil); code != 201 {
		t.Fatalf("create config.js: %d", code)
	}
	eventually(t, "config.js served", 5*time.Minute, 5*time.Second, func() (bool, string) {
		code, body := get(appURL + "/config.js")
		return code == 200 && strings.Contains(body, suffix), fmt.Sprintf("%d %.60s", code, body)
	})

	if code := c.do("POST", trackPath+"/deployments/promote", map[string]any{"sourceEnvironment": "development", "targetEnvironment": "staging"}, nil); code != 201 {
		t.Fatalf("promote: %d", code)
	}
	eventually(t, "staging active", 10*time.Minute, 5*time.Second, func() (bool, string) {
		var envs []map[string]any
		c.do("GET", trackPath+"/environments", nil, &envs)
		for _, e := range envs {
			if e["environment"] == "staging" {
				st, _ := e["status"].(string)
				return st == "active", st
			}
		}
		return false, "no staging"
	})

	if code := c.do("POST", trackPath+"/environments/staging/stop", nil, nil); code != 200 {
		t.Fatalf("stop: %d", code)
	}
	var logs map[string]any
	if code := c.do("POST", trackPath+"/logs/query", map[string]any{"environment": "development", "sort": "desc", "limit": 10,
		"startTime": time.Now().Add(-time.Hour).UTC().Format(time.RFC3339), "endTime": time.Now().UTC().Format(time.RFC3339)}, &logs); code != 200 {
		t.Fatalf("runtime logs: %d", code)
	}
}

// cleanup deletes what the test created: bindings, components, workflow runs,
// project release bindings and the project.
func cleanup(t *testing.T, oc *openchoreo.Client, ns, project, handle string) {
	ctx := context.Background()
	comps, _ := oc.ListComponents(ctx, ns, project, "")
	for _, comp := range comps {
		bs, _ := oc.ListReleaseBindings(ctx, ns, comp.Metadata.Name)
		for _, b := range bs {
			_ = oc.DeleteReleaseBinding(ctx, ns, b.Metadata.Name)
		}
		runs, _ := oc.ListWorkflowRuns(ctx, ns, "openchoreo.dev/component="+comp.Metadata.Name)
		for _, r := range runs {
			_, _ = oc.Raw().DeleteWorkflowRunWithResponse(ctx, ns, r.Metadata.Name)
		}
		_ = oc.DeleteComponent(ctx, ns, comp.Metadata.Name)
	}
	for _, env := range []string{"development", "staging", "production"} {
		_, _ = oc.Raw().DeleteProjectReleaseBindingWithResponse(ctx, ns, project+"-"+env)
	}
	_, _ = oc.Raw().DeleteProjectWithResponse(ctx, ns, project)
	t.Logf("cleaned up project %s / web app %s", project, handle)
}
