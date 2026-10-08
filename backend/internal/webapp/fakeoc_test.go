package webapp

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

const testNS = "org-ns"

// fakeOC is a generic in-memory OpenChoreo API (/api/v1/namespaces/{ns}/...):
// list / get / create / update / delete per collection, plus
// components/{name}/generate-release, which snapshots the component's
// Workload into a ComponentRelease the way OpenChoreo does.
type fakeOC struct {
	mu   sync.Mutex
	objs map[string]map[string]map[string]any // collection -> name -> object
	// beforeGenerate runs (unlocked) before a release snapshot is taken.
	beforeGenerate func(component, release string)
	deletes        []string // "collection/name"
}

func newFakeOC() *fakeOC {
	f := &fakeOC{objs: map[string]map[string]map[string]any{}}
	f.put("environments", obj("development", nil))
	f.put("environments", obj("production", nil))
	f.put("deploymentpipelines", map[string]any{"metadata": map[string]any{"name": "default"}, "spec": map[string]any{"promotionPaths": []any{
		map[string]any{"sourceEnvironmentRef": map[string]any{"name": "development"}, "targetEnvironmentRefs": []any{map[string]any{"name": "production"}}}}}})
	f.put("projects", obj("default", nil))
	return f
}

func obj(name string, spec map[string]any) map[string]any {
	o := map[string]any{"metadata": map[string]any{"name": name}}
	if spec != nil {
		o["spec"] = spec
	}
	return o
}

func nameOf(o map[string]any) string {
	n, _ := o["metadata"].(map[string]any)["name"].(string)
	return n
}

// put stores a deep copy of o.
func (f *fakeOC) put(coll string, o map[string]any) {
	if f.objs[coll] == nil {
		f.objs[coll] = map[string]map[string]any{}
	}
	md := o["metadata"].(map[string]any)
	if md["creationTimestamp"] == nil {
		md["creationTimestamp"] = time.Now().UTC().Format(time.RFC3339Nano)
	}
	f.objs[coll][nameOf(o)] = clone(o)
}

// Put stores an object (locked).
func (f *fakeOC) Put(coll string, o map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.put(coll, o)
}

// Get returns a copy of an object, or nil (locked).
func (f *fakeOC) Get(coll, name string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	if o, ok := f.objs[coll][name]; ok {
		return clone(o)
	}
	return nil
}

// List returns copies of a collection (locked).
func (f *fakeOC) List(coll string) []map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []map[string]any
	for _, o := range f.objs[coll] {
		out = append(out, clone(o))
	}
	return out
}

func clone(o map[string]any) map[string]any {
	raw, _ := json.Marshal(o)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return out
}

func ownerComponent(o map[string]any) string {
	spec, _ := o["spec"].(map[string]any)
	owner, _ := spec["owner"].(map[string]any)
	c, _ := owner["componentName"].(string)
	return c
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (f *fakeOC) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	rest, ok := strings.CutPrefix(r.URL.Path, "/api/v1/namespaces/"+testNS+"/")
	if !ok {
		rest, ok = strings.CutPrefix(r.URL.Path, "/api/v1alpha1/namespaces/"+testNS+"/")
	}
	if !ok {
		writeJSON(w, 404, map[string]any{"error": "unhandled " + r.URL.Path})
		return
	}
	parts := strings.Split(rest, "/")
	var body map[string]any
	if raw, _ := io.ReadAll(r.Body); len(raw) > 0 {
		_ = json.Unmarshal(raw, &body)
	}
	if len(parts) == 3 && parts[0] == "components" && parts[2] == "generate-release" && r.Method == http.MethodPost {
		f.generate(w, parts[1], body)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	coll := parts[0]
	switch {
	case len(parts) == 1 && r.Method == http.MethodGet:
		q := r.URL.Query()
		items := []map[string]any{}
		for _, o := range f.objs[coll] {
			if c := q.Get("component"); c != "" && ownerComponent(o) != c {
				continue
			}
			if sel := q.Get("labelSelector"); sel != "" {
				labels, _ := o["metadata"].(map[string]any)["labels"].(map[string]any)
				k, v, hasV := strings.Cut(sel, "=")
				if lv, ok := labels[k]; !ok || (hasV && lv != v) {
					continue
				}
			}
			items = append(items, clone(o))
		}
		writeJSON(w, 200, map[string]any{"items": items, "pagination": map[string]any{}})
	case len(parts) == 1 && r.Method == http.MethodPost:
		if coll == "secrets" {
			name, _ := body["secretName"].(string)
			body = map[string]any{"metadata": map[string]any{"name": name}, "data": body["data"]}
		}
		if _, exists := f.objs[coll][nameOf(body)]; exists {
			writeJSON(w, 409, map[string]any{"error": "already exists"})
			return
		}
		f.put(coll, body)
		writeJSON(w, 201, f.objs[coll][nameOf(body)])
	case len(parts) == 2 && r.Method == http.MethodGet:
		o, ok := f.objs[coll][parts[1]]
		if !ok {
			writeJSON(w, 404, map[string]any{"error": "not found"})
			return
		}
		writeJSON(w, 200, o)
	case len(parts) == 2 && r.Method == http.MethodPut:
		if _, ok := f.objs[coll][parts[1]]; !ok {
			writeJSON(w, 404, map[string]any{"error": "not found"})
			return
		}
		if body["metadata"] == nil {
			body["metadata"] = map[string]any{"name": parts[1]}
		}
		f.put(coll, body)
		writeJSON(w, 200, f.objs[coll][parts[1]])
	case len(parts) == 2 && r.Method == http.MethodDelete:
		delete(f.objs[coll], parts[1])
		f.deletes = append(f.deletes, coll+"/"+parts[1])
		w.WriteHeader(http.StatusNoContent)
	default:
		writeJSON(w, 404, map[string]any{"error": "unhandled " + r.Method + " " + rest})
	}
}

func (f *fakeOC) generate(w http.ResponseWriter, component string, body map[string]any) {
	name, _ := body["releaseName"].(string)
	if hook := f.beforeGenerate; hook != nil {
		hook(component, name)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, exists := f.objs["componentreleases"][name]; exists {
		writeJSON(w, 409, map[string]any{"error": "release exists"})
		return
	}
	var wl map[string]any
	for _, o := range f.objs["workloads"] {
		if ownerComponent(o) == component {
			wl, _ = o["spec"].(map[string]any)
		}
	}
	if wl == nil {
		writeJSON(w, 400, map[string]any{"error": "no workload"})
		return
	}
	f.put("componentreleases", map[string]any{
		"metadata": map[string]any{"name": name},
		"spec": map[string]any{
			"owner": map[string]any{"componentName": component, "projectName": "default"}, "componentType": map[string]any{},
			"workload": clone(wl),
		},
	})
	writeJSON(w, 201, map[string]any{})
}

// ---- fixtures ----

type memSecrets struct {
	mu      sync.Mutex
	deleted []string
	fail    bool
}

func (m *memSecrets) Put(_ context.Context, name, _ string, _ []string, _ map[string]string) (string, error) {
	return name, nil
}

func (m *memSecrets) Delete(_ context.Context, ref string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fail {
		return io.ErrUnexpectedEOF
	}
	m.deleted = append(m.deleted, ref)
	return nil
}

type fakeLogs struct {
	entries []platform.LogEntry // newest first
	queries []platform.LogQuery
	mu      sync.Mutex
}

// QueryLogs answers like the Observer: [start, end] inclusive, at
// millisecond precision, sorted by timestamp.
func (l *fakeLogs) QueryLogs(_ context.Context, q platform.LogQuery) ([]platform.LogEntry, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.queries = append(l.queries, q)
	start, end := q.Start.Truncate(time.Millisecond), q.End.Truncate(time.Millisecond)
	var out []platform.LogEntry
	src := l.entries
	if q.SortOrder == "asc" {
		src = make([]platform.LogEntry, len(l.entries))
		for i, e := range l.entries {
			src[len(l.entries)-1-i] = e
		}
	}
	for _, e := range src {
		t := e.Timestamp.Truncate(time.Millisecond)
		if t.Before(start) || t.After(end) {
			continue
		}
		out = append(out, e)
		if len(out) == q.Limit {
			break
		}
	}
	return out, nil
}

type testEnv struct {
	svc     *Service
	oc      *fakeOC
	secrets *memSecrets
	logs    *fakeLogs
	ctx     context.Context
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	f := newFakeOC()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	oc, err := openchoreo.New(openchoreo.Config{
		BaseURL: srv.URL, ServiceTokens: staticTokens{}, Strategy: openchoreo.ServiceOnlyStrategy,
		ResourceLabels: map[string]string{LabelProduct: ProductName},
		Retry:          openchoreo.RequestRetryConfig{RetryAttemptsMax: 1, RetryWaitMin: time.Millisecond, RetryWaitMax: time.Millisecond},
	})
	if err != nil {
		t.Fatal(err)
	}
	sec, logs := &memSecrets{}, &fakeLogs{}
	pl := &platform.Platform{Target: "openchoreo", Secrets: sec, Observability: logs, Git: &platform.PublicGitHub{APIURL: "http://127.0.0.1:1"}}
	svc := New(oc, pl, Options{Profile: platformres.Profile{}, WatchInterval: time.Hour, ReleaseVerifyWait: time.Millisecond})
	ctx := auth.WithOrg(context.Background(), &auth.Org{Namespace: testNS, Handle: "acme"})
	return &testEnv{svc: svc, oc: f, secrets: sec, logs: logs, ctx: ctx}
}

type staticTokens struct{}

func (staticTokens) Token() (string, error) { return "svc-token", nil }
func (staticTokens) Invalidate()            {}

// addTrack stores a track Component.
func (e *testEnv) addTrack(name, webApp, branch string, isDefault bool) {
	e.oc.Put("components", map[string]any{
		"metadata": map[string]any{
			"name":        name,
			"labels":      map[string]any{LabelProduct: ProductName, LabelWebApp: webApp},
			"annotations": map[string]any{AnnBranch: branch, AnnDefaultTrack: boolStr(isDefault), AnnPreset: "react", AnnPort: "8080"},
		},
		"spec": map[string]any{"owner": map[string]any{"projectName": "default"}, "componentType": map[string]any{"name": "deployment/web-app-hosting"}},
	})
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// addRun stores a finished WorkflowRun whose generate-workload produced image.
func (e *testEnv) addRun(name, component, image, status string, created time.Time, ann map[string]any) {
	wl, _ := json.Marshal(map[string]any{"spec": map[string]any{"container": map[string]any{"image": image}}})
	a := map[string]any{AnnOCWorkload: string(wl)}
	for k, v := range ann {
		a[k] = v
	}
	conds := []any{}
	switch status {
	case BuildSuccess:
		conds = append(conds, map[string]any{"type": "WorkflowCompleted", "status": "True", "reason": "Succeeded"})
	case BuildFailed:
		conds = append(conds, map[string]any{"type": "WorkflowFailed", "status": "True", "reason": "Failed"})
	}
	e.oc.Put("workflowruns", map[string]any{
		"metadata": map[string]any{
			"name": name, "creationTimestamp": created.UTC().Format(time.RFC3339),
			"labels":      map[string]any{LabelOCComponent: component, LabelWebApp: "site"},
			"annotations": a,
		},
		"spec":   map[string]any{"workflow": map[string]any{"name": "wf"}},
		"status": map[string]any{"conditions": conds},
	})
}

// releaseImage returns the image frozen into a stored ComponentRelease.
func (e *testEnv) releaseImage(name string) string {
	r := e.oc.Get("componentreleases", name)
	if r == nil {
		return ""
	}
	wl, _ := r["spec"].(map[string]any)["workload"].(map[string]any)
	c, _ := wl["container"].(map[string]any)
	img, _ := c["image"].(string)
	return img
}
