package webapp

import (
	"context"
	"log/slog"
	"math"
	"sort"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// MetricsRange is a Metrics page time range (frontend types/metrics.ts;
// capped at 24h — the observability plane keeps 3 days).
type MetricsRange string

// rangeConfig mirrors the console's RANGE_CONFIG: window and chart points.
var rangeConfig = map[MetricsRange]struct {
	window time.Duration
	points int
}{
	"30m": {30 * time.Minute, 30},
	"1h":  {time.Hour, 30},
	"6h":  {6 * time.Hour, 36},
	"24h": {24 * time.Hour, 48},
}

// MetricsRow is one chart point: `time` (RFC 3339) plus one value per series.
type MetricsRow map[string]any

// WebAppMetrics is the Metrics page DTO (frontend WebAppMetrics). CPU and
// memory usage are totals across the environment's pods; request and limit
// are the environment's allocation (see Allocation).
type WebAppMetrics struct {
	// RequestRows: requests per second — total, success.
	RequestRows []MetricsRow `json:"requestRows"`
	// LatencyRows: milliseconds — p50, p90, p99.
	LatencyRows []MetricsRow `json:"latencyRows"`
	// ErrorRows: percent of requests that failed — errorRate.
	ErrorRows []MetricsRow `json:"errorRows"`
	// CPURows: vCPU — usage, request, limit.
	CPURows []MetricsRow `json:"cpuRows"`
	// MemoryRows: MB — usage, request, limit.
	MemoryRows []MetricsRow `json:"memoryRows"`
	// Replicas is the desired replica count the request/limit series are
	// computed for (per-replica value × Replicas).
	Replicas int `json:"replicas"`
	// HTTPAvailable is false when the platform records no HTTP metrics for
	// the web app (the console then hides the HTTP charts).
	HTTPAvailable bool `json:"httpAvailable"`
}

// Usage is an environment's current resource usage (totals across pods).
type Usage struct {
	CPUMillicores *float64 `json:"cpuMillicores,omitempty"`
	MemoryBytes   *int64   `json:"memoryBytes,omitempty"`
	SampledAt     string   `json:"sampledAt,omitempty"`
}

const mib = 1024 * 1024

// Metrics returns an environment's metrics over a range.
func (s *Service) Metrics(ctx context.Context, webAppID, trackID, env string, r MetricsRange) (*WebAppMetrics, error) {
	cfg, ok := rangeConfig[r]
	if !ok {
		return nil, errf(CodeBadRequest, "range must be one of 30m, 1h, 6h, 24h")
	}
	t, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	step := cfg.window / time.Duration(cfg.points)
	end := time.Now().UTC().Truncate(time.Minute)
	q := platform.MetricsQuery{
		Namespace: ns(ctx), Project: t.Project, Component: t.Name, Environment: env,
		Start: end.Add(-step * time.Duration(cfg.points-1)), End: end, Step: step,
	}
	var res, http map[string][]platform.MetricSample
	var alloc Allocation
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() error {
		alloc = s.allocation(gctx, b)
		return nil
	})
	g.Go(func() (err error) {
		rq := q
		rq.Metric = "resource"
		res, err = s.p.Observability.QueryMetrics(gctx, rq)
		return err
	})
	g.Go(func() error {
		hq := q
		hq.Metric = "http"
		var err error
		if http, err = s.p.Observability.QueryMetrics(gctx, hq); err != nil {
			// HTTP metrics are optional: CPU/memory still render.
			slog.WarnContext(ctx, "http metrics query failed", "track", t.Name, "env", env, "error", err)
			http = nil
		}
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return BuildMetrics(res, http, alloc), nil
}

// Allocation is an environment's CPU/memory request and limit per replica,
// and the desired replica count.
//
// The Observer's cpuRequests/cpuLimits/memoryRequests/memoryLimits series are
// sums over the pods that exist at each instant, so a rolling restart (old
// and new pod side by side) briefly doubles them — the chart showed the limit
// jumping from 0.1 to 0.2 vCPU on every redeploy. The chart instead draws the
// configured per-replica value × the desired replicas (the capacity the
// environment is meant to have), while usage stays the sum across pods.
// The configured values are the current ones: earlier points in the range
// don't reflect resource or replica changes made since.
type Allocation struct {
	Replicas                       int
	CPURequest, CPULimit           float64 // vCPU per replica
	MemoryRequestMB, MemoryLimitMB float64 // MB per replica
}

// allocation reads the binding's resources and desired replicas: the fixed
// replica count, or with HPA on the autoscaler's current desired count (its
// minimum when the live HPA can't be read).
func (s *Service) allocation(ctx context.Context, b *gen.ReleaseBinding) Allocation {
	c := readEnvConfigs(b.Spec)
	a := Allocation{
		Replicas:   c.Replicas,
		CPURequest: float64(ParseCPU(c.CPURequest)) / 1000, CPULimit: float64(ParseCPU(c.CPULimit)) / 1000,
		MemoryRequestMB: float64(ParseMemory(c.MemRequest)) / mib, MemoryLimitMB: float64(ParseMemory(c.MemLimit)) / mib,
	}
	if enabled, h := hpaConfig(b.Spec); enabled {
		a.Replicas = h.MinReplicas
		tctx, cancel := context.WithTimeout(ctx, usageTimeout)
		defer cancel()
		tree, err := s.oc.ResourceTree(tctx, ns(ctx), b.Metadata.Name)
		if err != nil {
			slog.DebugContext(ctx, "resource tree lookup failed; using HPA min replicas", "binding", b.Metadata.Name, "error", err)
		} else if n := DesiredReplicas(tree); n > 0 {
			a.Replicas = n
		}
	}
	if a.Replicas < 1 {
		a.Replicas = 1
	}
	return a
}

// DesiredReplicas reads the replica count the platform is converging on from
// a binding's resource tree: the HPA's status.desiredReplicas, else the
// Deployment's spec.replicas (which the HPA sets). 0 when neither is present.
func DesiredReplicas(tree *gen.K8sResourceTreeResponse) int {
	if tree == nil {
		return 0
	}
	hpa, deploy := 0, 0
	for _, rel := range tree.RenderedReleases {
		for _, n := range rel.Nodes {
			switch n.Kind {
			case "HorizontalPodAutoscaler":
				st, _ := n.Object["status"].(map[string]any)
				if v := intOf(st["desiredReplicas"]); v > 0 {
					hpa = v
				}
			case "Deployment":
				sp, _ := n.Object["spec"].(map[string]any)
				if v := intOf(sp["replicas"]); v > 0 {
					deploy = v
				}
			}
		}
	}
	if hpa > 0 {
		return hpa
	}
	return deploy
}

// BuildMetrics maps Observer series to the console's chart rows. CPU and
// memory rows are the usage samples, each carrying request/limit from alloc
// (the Observer's request/limit series are not used — see Allocation — so
// their timestamps must not add rows without usage).
func BuildMetrics(res, http map[string][]platform.MetricSample, alloc Allocation) *WebAppMetrics {
	ident := func(v float64) float64 { return v }
	toMB := func(v float64) float64 { return v / mib }
	toMs := func(v float64) float64 { return v * 1000 }
	out := &WebAppMetrics{
		CPURows:     rows(res, map[string]string{"usage": "cpuUsage"}, ident, 4),
		MemoryRows:  rows(res, map[string]string{"usage": "memoryUsage"}, toMB, 2),
		RequestRows: rows(http, map[string]string{"total": "requestCount", "success": "successfulRequestCount"}, ident, 3),
		LatencyRows: rows(http, map[string]string{"p50": "latencyP50", "p90": "latencyP90", "p99": "latencyP99"}, toMs, 1),
		ErrorRows:   []MetricsRow{},
		Replicas:    alloc.Replicas,
	}
	replicas := float64(alloc.Replicas)
	for _, r := range out.CPURows {
		r["request"], r["limit"] = round(alloc.CPURequest*replicas, 4), round(alloc.CPULimit*replicas, 4)
	}
	for _, r := range out.MemoryRows {
		r["request"], r["limit"] = round(alloc.MemoryRequestMB*replicas, 2), round(alloc.MemoryLimitMB*replicas, 2)
	}
	out.HTTPAvailable = len(http["requestCount"]) > 0
	failed := byTime(http["unsuccessfulRequestCount"])
	for _, p := range http["requestCount"] {
		rate := 0.0
		if p.Value > 0 {
			rate = round(failed[p.Time.Unix()]/p.Value*100, 2)
		}
		out.ErrorRows = append(out.ErrorRows, MetricsRow{"time": p.Time.UTC().Format(time.RFC3339), "errorRate": rate})
	}
	return out
}

// rows joins series (series key -> Observer name) on their timestamps.
func rows(series map[string][]platform.MetricSample, keys map[string]string, conv func(float64) float64, decimals int) []MetricsRow {
	byTS := map[int64]MetricsRow{}
	for key, name := range keys {
		for _, p := range series[name] {
			ts := p.Time.Unix()
			row, ok := byTS[ts]
			if !ok {
				row = MetricsRow{"time": p.Time.UTC().Format(time.RFC3339)}
				byTS[ts] = row
			}
			row[key] = round(conv(p.Value), decimals)
		}
	}
	tss := make([]int64, 0, len(byTS))
	for ts := range byTS {
		tss = append(tss, ts)
	}
	sort.Slice(tss, func(i, j int) bool { return tss[i] < tss[j] })
	out := make([]MetricsRow, 0, len(tss))
	for _, ts := range tss {
		out = append(out, byTS[ts])
	}
	return out
}

func byTime(s []platform.MetricSample) map[int64]float64 {
	m := make(map[int64]float64, len(s))
	for _, p := range s {
		m[p.Time.Unix()] = p.Value
	}
	return m
}

func round(v float64, decimals int) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	f := math.Pow(10, float64(decimals))
	return math.Round(v*f) / f
}

// usageTimeout bounds the resource-tree lookup behind the metrics allocation.
const usageTimeout = 3 * time.Second

// Usage returns an environment's latest CPU/memory usage, totals across its
// pods (fields absent when the platform has no sample).
func (s *Service) Usage(ctx context.Context, webAppID, trackID, env string) (*Usage, error) {
	t, _, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	return s.latestUsage(ctx, *t, env)
}

func (s *Service) latestUsage(ctx context.Context, t track, env string) (*Usage, error) {
	end := time.Now().UTC()
	res, err := s.p.Observability.QueryMetrics(ctx, platform.MetricsQuery{
		Namespace: ns(ctx), Project: t.Project, Component: t.Name, Environment: env, Metric: "resource",
		Start: end.Add(-10 * time.Minute), End: end, Step: time.Minute,
	})
	if err != nil {
		return nil, err
	}
	out := &Usage{}
	if c := res["cpuUsage"]; len(c) > 0 {
		v := round(c[len(c)-1].Value*1000, 2)
		out.CPUMillicores = &v
		out.SampledAt = c[len(c)-1].Time.UTC().Format(time.RFC3339)
	}
	if m := res["memoryUsage"]; len(m) > 0 {
		v := int64(m[len(m)-1].Value)
		out.MemoryBytes = &v
		out.SampledAt = m[len(m)-1].Time.UTC().Format(time.RFC3339)
	}
	return out, nil
}
