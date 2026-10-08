package platform

import (
	"context"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

// ObserverLogs queries `POST {base}/api/v1/logs/query`: the OpenChoreo
// Observer directly (TARGET=openchoreo) or cloud-obs-proxy
// (`/wso2cloud-obs/api/v1/logs/query`, which pins searchScope.namespace to the
// caller's org) on WSO2 Cloud. The FE never calls it directly (D13).
type ObserverLogs struct {
	BaseURL string
	call    *caller
}

// NewObserverLogs builds an ObserverLogs client.
func NewObserverLogs(baseURL string, tokens openchoreo.TokenSource, impersonate, forceService bool) *ObserverLogs {
	return &ObserverLogs{BaseURL: baseURL, call: newCaller(tokens, impersonate, forceService)}
}

type obsScope struct {
	Namespace       string `json:"namespace"`
	Project         string `json:"project,omitempty"`
	Component       string `json:"component,omitempty"`
	Environment     string `json:"environment,omitempty"`
	WorkflowRunName string `json:"workflowRunName,omitempty"`
}

// QueryMetrics implements Observability (`POST {base}/api/v1/metrics/query`).
// Resource series are totals across the component's pods (cores, bytes);
// HTTP latencies are in seconds.
func (o *ObserverLogs) QueryMetrics(ctx context.Context, q MetricsQuery) (map[string][]MetricSample, error) {
	body := map[string]any{
		"metric":      q.Metric,
		"searchScope": obsScope{Namespace: q.Namespace, Project: q.Project, Component: q.Component, Environment: q.Environment},
		"startTime":   q.Start.UTC().Format(time.RFC3339),
		"endTime":     q.End.UTC().Format(time.RFC3339),
	}
	if q.Step > 0 {
		body["step"] = formatStep(q.Step)
	}
	var resp map[string][]struct {
		Timestamp string  `json:"timestamp"`
		Value     float64 `json:"value"`
	}
	if err := o.call.do(ctx, http.MethodPost, o.BaseURL+"/api/v1/metrics/query", body, &resp); err != nil {
		return nil, err
	}
	out := make(map[string][]MetricSample, len(resp))
	for name, series := range resp {
		samples := make([]MetricSample, 0, len(series))
		for _, p := range series {
			t, err := time.Parse(time.RFC3339Nano, p.Timestamp)
			if err != nil {
				continue
			}
			samples = append(samples, MetricSample{Time: t, Value: p.Value})
		}
		if len(samples) > 0 {
			out[name] = samples
		}
	}
	return out, nil
}

// formatStep renders a step as the Observer expects it (e.g. 1m, 30m, 1h).
func formatStep(d time.Duration) string {
	switch {
	case d%time.Hour == 0:
		return strconv.Itoa(int(d/time.Hour)) + "h"
	case d%time.Minute == 0:
		return strconv.Itoa(int(d/time.Minute)) + "m"
	default:
		return strconv.Itoa(int(d/time.Second)) + "s"
	}
}

// QueryLogs implements Observability. Level filtering is applied here: the
// Observer's own logLevels filter does not match plain container output.
func (o *ObserverLogs) QueryLogs(ctx context.Context, q LogQuery) ([]LogEntry, error) {
	body := map[string]any{
		"searchScope": obsScope{Namespace: q.Namespace, Project: q.Project, Component: q.Component, Environment: q.Environment, WorkflowRunName: q.WorkflowRunName},
		"startTime":   q.Start.UTC().Format(time.RFC3339Nano),
		"endTime":     q.End.UTC().Format(time.RFC3339Nano),
		"limit":       q.Limit,
		"sortOrder":   q.SortOrder,
	}
	if q.SearchPhrase != "" {
		body["searchPhrase"] = q.SearchPhrase
	}
	var resp struct {
		Logs []struct {
			Timestamp string `json:"timestamp"`
			Log       string `json:"log"`
			Level     string `json:"level"`
			Metadata  struct {
				PodName       string `json:"podName"`
				ContainerName string `json:"containerName"`
			} `json:"metadata"`
		} `json:"logs"`
	}
	if err := o.call.do(ctx, http.MethodPost, o.BaseURL+"/api/v1/logs/query", body, &resp); err != nil {
		return nil, err
	}
	out := make([]LogEntry, 0, len(resp.Logs))
	for _, l := range resp.Logs {
		e := LogEntry{Log: l.Log, Level: strings.ToUpper(l.Level), Pod: l.Metadata.PodName, Container: l.Metadata.ContainerName}
		if e.Level == "" {
			e.Level = "INFO"
		}
		if t, err := time.Parse(time.RFC3339Nano, l.Timestamp); err == nil {
			e.Timestamp = t
		}
		if len(q.LogLevels) > 0 && !slices.Contains(q.LogLevels, e.Level) {
			continue
		}
		out = append(out, e)
	}
	return out, nil
}
