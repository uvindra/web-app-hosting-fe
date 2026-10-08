// Package platform holds the target adapters (D14): every WSO2 Cloud-specific
// dependency sits behind an interface with a `wso2cloud` and an `openchoreo`
// (local k3d) implementation, selected at startup.
package platform

import (
	"context"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
)

// OrgResolver maps a verified caller to its org and OpenChoreo namespace.
type OrgResolver interface {
	Resolve(ctx context.Context, claims *auth.Claims) (*auth.Org, error)
}

// Commit is one commit's display metadata.
type Commit struct {
	SHA         string
	Message     string
	Author      string
	CommittedAt time.Time
}

// RepoRef identifies a web app's source repository.
type RepoRef struct {
	URL    string
	Owner  string
	Repo   string
	Branch string
	// AppPath is the directory inside the repo ("." for root).
	AppPath string
	// InstallationID is the GitHub App installation (0 = public repo).
	InstallationID int64
}

// Installation is a GitHub App installation bound to the org.
type Installation struct {
	ID      int64  `json:"installationId"`
	Account string `json:"githubAccount,omitempty"`
}

// Repository is a repository visible to an installation.
type Repository struct {
	FullName      string `json:"fullName"`
	Name          string `json:"name"`
	Owner         string `json:"owner"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"defaultBranch"`
}

// GitProvider reads repositories and prepares build credentials.
type GitProvider interface {
	// GitHubAppEnabled reports whether the GitHub App flow is available.
	GitHubAppEnabled() bool
	BindInstallations(ctx context.Context, code string) ([]Installation, error)
	ListInstallations(ctx context.Context) ([]Installation, error)
	ListRepos(ctx context.Context, installationID int64) ([]Repository, error)
	ListBranches(ctx context.Context, repo RepoRef) ([]string, error)
	LatestCommit(ctx context.Context, repo RepoRef, project, component string) (*Commit, error)
	// BindSource persists a component's GitHub App source binding (no-op for public repos).
	BindSource(ctx context.Context, repo RepoRef, project, component string) error
	// PrepareBuild provisions per-run clone credentials and returns the
	// workflow `repository.secretRef` to use ("" for public repositories).
	PrepareBuild(ctx context.Context, repo RepoRef, project, component, runName string) (string, error)
}

// SecretStore stores secret values outside OpenChoreo specs and returns the
// SecretReference name workloads reference via env valueFrom.secretKeyRef.
type SecretStore interface {
	// Put creates or updates a secret so it holds exactly keys: values in data
	// are set, keys absent from data keep their stored value (stores that
	// cannot merge reject that), other stored keys are removed. name is a
	// stable caller-chosen name; the returned ref is opaque (see
	// SecretReferenceName).
	Put(ctx context.Context, name string, existingRef string, keys []string, data map[string]string) (string, error)
	Delete(ctx context.Context, ref string) error
}

// LogQuery is a logs query against the observability plane.
type LogQuery struct {
	Namespace       string
	Project         string
	Component       string
	Environment     string
	WorkflowRunName string
	Start, End      time.Time
	Limit           int
	SortOrder       string // asc | desc
	SearchPhrase    string
	LogLevels       []string
}

// LogEntry is one log line from the observability plane.
type LogEntry struct {
	Timestamp time.Time
	Log       string
	Level     string
	Pod       string
	Container string
}

// MetricsQuery is a metrics query against the observability plane.
type MetricsQuery struct {
	Namespace   string
	Project     string
	Component   string
	Environment string
	// Metric is "resource" (CPU/memory) or "http".
	Metric     string
	Start, End time.Time
	Step       time.Duration
}

// MetricSample is one point of a metric series.
type MetricSample struct {
	Time  time.Time
	Value float64
}

// Observability queries archived logs and metrics.
type Observability interface {
	QueryLogs(ctx context.Context, q LogQuery) ([]LogEntry, error)
	// QueryMetrics returns the query's series by name (e.g. cpuUsage,
	// memoryLimits, requestCount, latencyP99); an empty map when the
	// platform has no data for the metric.
	QueryMetrics(ctx context.Context, q MetricsQuery) (map[string][]MetricSample, error)
}

// Platform bundles the adapters for the configured target.
type Platform struct {
	Target        string
	Org           OrgResolver
	Git           GitProvider
	Secrets       SecretStore
	Observability Observability
	// BillingEnabled reports whether a billing service (PAS 402 quota) exists.
	BillingEnabled bool
	// Billing reads the org's plan (feature gating).
	Billing Billing
}
