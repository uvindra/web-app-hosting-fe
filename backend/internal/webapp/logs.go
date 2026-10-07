package webapp

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

var accessLogRE = regexp.MustCompile(`"(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+) HTTP/[0-9.]+" (\d{3})`)

// RuntimeLogs queries an environment's archived runtime logs through the
// observability plane (D13: the console never calls it directly). Paging is
// time-based: the cursor is the timestamp of the last row returned
// (second precision, so lines sharing that second may be skipped).
func (s *Service) RuntimeLogs(ctx context.Context, webAppID, trackID string, req LogsRequest) (*LogsPage, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	if err := s.checkEnv(ctx, *t, req.Environment); err != nil {
		return nil, err
	}
	end := time.Now().UTC()
	start := end.Add(-time.Hour)
	if v, err := time.Parse(time.RFC3339, req.StartTime); err == nil {
		start = v
	}
	if v, err := time.Parse(time.RFC3339, req.EndTime); err == nil {
		end = v
	}
	sortOrder := "desc"
	if req.Sort == "asc" {
		sortOrder = "asc"
	}
	if req.Cursor != "" {
		c, err := time.Parse(time.RFC3339Nano, req.Cursor)
		if err != nil {
			return nil, errf(CodeBadRequest, "invalid cursor")
		}
		if sortOrder == "desc" {
			end = c.Add(-time.Second)
		} else {
			start = c.Add(time.Second)
		}
	}
	limit := req.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	levels := make([]string, 0, len(req.Levels))
	for _, l := range req.Levels {
		levels = append(levels, strings.ToUpper(l))
	}
	entries, err := s.p.Observability.QueryLogs(ctx, platform.LogQuery{
		Namespace: ns(ctx), Project: t.Project, Component: t.Name, Environment: req.Environment,
		Start: start, End: end, Limit: limit, SortOrder: sortOrder, SearchPhrase: strings.TrimSpace(req.SearchPhrase), LogLevels: levels,
	})
	if err != nil {
		return nil, fmt.Errorf("query runtime logs: %w", err)
	}
	page := &LogsPage{Items: make([]LogRow, 0, len(entries))}
	for i, e := range entries {
		page.Items = append(page.Items, ToLogRow(e, i))
	}
	if len(entries) >= limit && len(entries) > 0 {
		page.NextCursor = entries[len(entries)-1].Timestamp.UTC().Format(time.RFC3339Nano)
	}
	return page, nil
}

// ToLogRow maps a log entry, recognising web-server access lines.
func ToLogRow(e platform.LogEntry, i int) LogRow {
	sum := sha1.Sum([]byte(fmt.Sprintf("%s|%s|%s|%d", e.Timestamp.Format(time.RFC3339Nano), e.Pod, e.Log, i)))
	r := LogRow{
		ID: hex.EncodeToString(sum[:8]), Timestamp: e.Timestamp.UTC().Format(time.RFC3339), Level: normLevel(e.Level),
		LogLine: strings.TrimRight(e.Log, "\n"), Source: "app", PodName: e.Pod, ContainerName: e.Container,
	}
	if m := accessLogRE.FindStringSubmatch(e.Log); m != nil {
		r.Source, r.Method, r.Path = "access", m[1], m[2]
		r.StatusCode, _ = strconv.Atoi(m[3])
		if r.StatusCode >= 500 {
			r.Level = "ERROR"
		} else if r.StatusCode >= 400 {
			r.Level = "WARN"
		}
	}
	return r
}

func normLevel(l string) string {
	switch strings.ToUpper(l) {
	case "WARN", "WARNING":
		return "WARN"
	case "ERROR", "FATAL", "CRITICAL":
		return "ERROR"
	case "DEBUG", "TRACE":
		return "DEBUG"
	default:
		return "INFO"
	}
}

// DefaultURLs returns each pipeline environment's default URL ("" when not deployed).
func (s *Service) DefaultURLs(ctx context.Context, webAppID, trackID string) ([]EnvironmentDefaultURL, error) {
	t, err := s.getTrack(ctx, webAppID, trackID)
	if err != nil {
		return nil, err
	}
	envs, bindings, err := s.envBindings(ctx, *t)
	if err != nil {
		return nil, err
	}
	out := make([]EnvironmentDefaultURL, 0, len(envs))
	for _, e := range envs {
		u := EnvironmentDefaultURL{Environment: e.ID}
		if b, ok := bindings[e.ID]; ok && bindingActive(b) {
			u.URL = s.bindingURL(b)
		}
		out = append(out, u)
	}
	return out, nil
}

// Git pass-throughs (GitHub App flow, C4).

// BindInstallations exchanges a GitHub OAuth code for the org's installations.
func (s *Service) BindInstallations(ctx context.Context, code string) ([]platform.Installation, error) {
	if !s.p.Git.GitHubAppEnabled() {
		return nil, errf(CodeNotSupported, "GitHub App is not available on this platform")
	}
	return s.p.Git.BindInstallations(ctx, code)
}

// ListInstallations lists the org's GitHub App installations.
func (s *Service) ListInstallations(ctx context.Context) ([]platform.Installation, error) {
	return s.p.Git.ListInstallations(ctx)
}

// ListRepos lists repositories of an installation.
func (s *Service) ListRepos(ctx context.Context, installationID int64) ([]platform.Repository, error) {
	if !s.p.Git.GitHubAppEnabled() {
		return nil, errf(CodeNotSupported, "GitHub App is not available on this platform")
	}
	return s.p.Git.ListRepos(ctx, installationID)
}

// ListBranches lists a repository's branches (public URL or installation repo).
func (s *Service) ListBranches(ctx context.Context, repoURL string, installationID int64, owner, repo string) ([]string, error) {
	ref := platform.RepoRef{URL: repoURL, InstallationID: installationID, Owner: owner, Repo: repo}
	if ref.Owner == "" {
		ref.Owner, ref.Repo, _ = platform.ParseGitHubURL(repoURL)
	}
	if ref.Owner == "" || ref.Repo == "" {
		return nil, errf(CodeBadRequest, "a GitHub repository URL or owner/repo is required")
	}
	return s.p.Git.ListBranches(ctx, ref)
}
