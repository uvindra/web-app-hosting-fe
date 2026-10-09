package platform

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

func obsServer(t *testing.T, status int, body string) *ObserverLogs {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return NewObserverLogs(srv.URL, svcTokens{}, true, false)
}

// cloud-obs-proxy answers 500 OBS-V1-L-04 when the scope has no indexed data
// yet (fresh org): that reads as no logs / no metrics, not an error. Other
// 500s still fail.
func TestObserverNoDataIsEmpty(t *testing.T) {
	ctx := auth.WithUserToken(context.Background(), "user-jwt")
	now := time.Now()
	lq := LogQuery{Namespace: "ns", Project: "p", Environment: "development", Start: now.Add(-time.Hour), End: now, Limit: 10}
	mq := MetricsQuery{Metric: "resource", Namespace: "ns", Project: "p", Environment: "development", Start: now.Add(-time.Hour), End: now}

	o := obsServer(t, http.StatusInternalServerError, `{"title":"Internal Server Error","errorCode":"OBS-V1-L-04","message":"failed to retrieve logs"}`)
	logs, err := o.QueryLogs(ctx, lq)
	if err != nil || logs == nil || len(logs) != 0 {
		t.Fatalf("logs = %v, %v", logs, err)
	}
	m, err := o.QueryMetrics(ctx, mq)
	if err != nil || m == nil || len(m) != 0 {
		t.Fatalf("metrics = %v, %v", m, err)
	}

	other := obsServer(t, http.StatusInternalServerError, `{"errorCode":"OBS-V1-X-99","message":"boom"}`)
	if _, err := other.QueryLogs(ctx, lq); !errors.Is(err, openchoreo.ErrInternalServerError) {
		t.Fatalf("logs, other 500: err = %v", err)
	}
	if _, err := other.QueryMetrics(ctx, mq); !errors.Is(err, openchoreo.ErrInternalServerError) {
		t.Fatalf("metrics, other 500: err = %v", err)
	}
}
