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
	gets           []string // single-object reads, "collection/name"
	// beforeUpdate runs (unlocked) before a PUT of collection/name.
	beforeUpdate func(coll, name string)
	// stepLogs answers workflowruns/{name}/logs?task= (after logDelay);
	// maxInFlight records the peak concurrency of those reads.
	stepLogs              map[string][]string
	logDelay              time.Duration
	inFlight, maxInFlight int
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
	if len(parts) == 3 && parts[0] == "workflowruns" && parts[2] == "logs" {
		f.serveStepLogs(w, r.URL.Query().Get("task"))
		return
	}
	if len(parts) == 3 && parts[0] == "components" && parts[2] == "generate-release" && r.Method == http.MethodPost {
		f.generate(w, parts[1], body)
		return
	}
	if hook := f.beforeUpdate; hook != nil && len(parts) == 2 && r.Method == http.MethodPut {
		hook(parts[0], parts[1])
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
		f.gets = append(f.gets, coll+"/"+parts[1])
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

func (f *fakeOC) serveStepLogs(w http.ResponseWriter, task string) {
	f.mu.Lock()
	f.inFlight++
	f.maxInFlight = max(f.maxInFlight, f.inFlight)
	f.mu.Unlock()
	time.Sleep(f.logDelay)
	f.mu.Lock()
	f.inFlight--
	lines := f.stepLogs[task]
	f.mu.Unlock()
	out := []map[string]any{}
	for _, l := range lines {
		out = append(out, map[string]any{"log": l + "\n"})
	}
	writeJSON(w, 200, out)
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
	// Freeze the ComponentType and the component's traits/parameters, as
	// OpenChoreo does.
	ct := map[string]any{}
	profile := map[string]any{}
	if comp, ok := f.objs["components"][component]; ok {
		spec, _ := comp["spec"].(map[string]any)
		ref, _ := spec["componentType"].(map[string]any)
		ctName, _ := ref["name"].(string)
		_, short, _ := strings.Cut(ctName, "/")
		if t, ok := f.objs["componenttypes"][short]; ok {
			ct = map[string]any{"kind": "ComponentType", "name": ctName, "spec": clone(t)["spec"]}
		}
		if tr, ok := spec["traits"]; ok {
			profile["traits"] = tr
		}
		if p, ok := spec["parameters"]; ok {
			profile["parameters"] = p
		}
	}
	f.put("componentreleases", map[string]any{
		"metadata": map[string]any{"name": name},
		"spec": map[string]any{
			"owner": map[string]any{"componentName": component, "projectName": "default"}, "componentType": ct,
			"componentProfile": clone(profile), "workload": clone(wl),
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
	// metrics answers QueryMetrics by metric (resource | http).
	metrics map[string]map[string][]platform.MetricSample
	entries []platform.LogEntry // newest first
	// inclusive switches from the live Observer's window semantics (bounds
	// truncated to seconds, both exclusive) to inclusive, full-precision bounds.
	inclusive bool
	queries   []platform.LogQuery
	mu        sync.Mutex
}

// QueryLogs answers like the Observer: entries in the window, sorted by
// timestamp (ties in a stable but arbitrary order), at most Limit.
func (l *fakeLogs) QueryLogs(_ context.Context, q platform.LogQuery) ([]platform.LogEntry, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.queries = append(l.queries, q)
	in := func(t time.Time) bool {
		if l.inclusive {
			return !t.Before(q.Start) && !t.After(q.End)
		}
		return t.After(q.Start.Truncate(time.Second)) && t.Before(q.End.Truncate(time.Second))
	}
	src := l.entries
	if q.SortOrder == "asc" {
		src = make([]platform.LogEntry, len(l.entries))
		for i, e := range l.entries {
			src[len(l.entries)-1-i] = e
		}
	}
	var out []platform.LogEntry
	for _, e := range src {
		if !in(e.Timestamp) {
			continue
		}
		out = append(out, e)
		if len(out) == q.Limit {
			break
		}
	}
	return out, nil
}

// QueryMetrics answers from l.metrics.
func (l *fakeLogs) QueryMetrics(_ context.Context, q platform.MetricsQuery) (map[string][]platform.MetricSample, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if m, ok := l.metrics[q.Metric]; ok {
		return m, nil
	}
	return map[string][]platform.MetricSample{}, nil
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
	pl := &platform.Platform{Target: "openchoreo", Secrets: sec, Observability: logs, Git: &platform.PublicGitHub{APIURL: "http://127.0.0.1:1"}, Billing: &testBilling{typ: platform.PlanPaid}}
	svc := New(oc, pl, Options{Profile: platformres.Profile{}, WatchInterval: time.Hour, ReleaseVerifyWait: time.Millisecond})
	ctx := auth.WithOrg(context.Background(), &auth.Org{Namespace: testNS, Handle: "acme"})
	return &testEnv{svc: svc, oc: f, secrets: sec, logs: logs, ctx: ctx}
}

// testBilling is a switchable plan.
type testBilling struct {
	mu  sync.Mutex
	typ string
}

func (b *testBilling) Plan(context.Context) (*platform.PlanInfo, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return &platform.PlanInfo{Type: b.typ, Name: b.typ}, nil
}

func (e *testEnv) setPlan(typ string) {
	b := e.svc.p.Billing.(*testBilling)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.typ = typ
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
