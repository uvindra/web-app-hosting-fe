package webapp

import (
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
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
// keyset on the timestamp (see logCursor): the Observer filters startTime /
// endTime exclusively at second precision and returns second-precision
// timestamps, so many lines share the cursor's timestamp.
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
	desc := req.Sort != "asc"
	sortOrder := "desc"
	if !desc {
		sortOrder = "asc"
	}
	var cur *logCursor
	if req.Cursor != "" {
		if cur, err = decodeLogCursor(req.Cursor); err != nil {
			return nil, errf(CodeBadRequest, "invalid cursor")
		}
		// Widen the window past the cursor by a second (exclusive,
		// second-precision bounds upstream) and drop what was already returned.
		if desc {
			end = cur.at.Add(time.Second)
		} else {
			start = cur.at.Add(-time.Second)
		}
	}
	limit := req.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	queryLimit := limit
	if cur != nil {
		queryLimit += len(cur.Seen)
	}
	levels := make([]string, 0, len(req.Levels))
	for _, l := range req.Levels {
		levels = append(levels, strings.ToUpper(l))
	}
	entries, err := s.p.Observability.QueryLogs(ctx, platform.LogQuery{
		Namespace: ns(ctx), Project: t.Project, Component: t.Name, Environment: req.Environment,
		Start: start, End: end, Limit: queryLimit, SortOrder: sortOrder, SearchPhrase: strings.TrimSpace(req.SearchPhrase), LogLevels: levels,
	})
	if err != nil {
		return nil, fmt.Errorf("query runtime logs: %w", err)
	}
	// Lines on the far side of the cursor, and the cursor-side lines the
	// earlier pages returned (a multiset, so repeated identical lines count).
	seen := map[string]int{}
	occ := map[string]int{}
	if cur != nil {
		for _, k := range cur.Seen {
			seen[k]++
			occ[k]++
		}
	}
	kept := make([]platform.LogEntry, 0, limit)
	page := &LogsPage{Items: make([]LogRow, 0, limit)}
	more := len(entries) >= queryLimit // the upstream may hold more
	for _, e := range entries {
		if len(kept) == limit {
			more = true
			break
		}
		k := logKey(e)
		if cur != nil {
			if (desc && e.Timestamp.After(cur.at)) || (!desc && e.Timestamp.Before(cur.at)) {
				continue
			}
			if seen[k] > 0 {
				seen[k]--
				continue
			}
		}
		kept = append(kept, e)
		page.Items = append(page.Items, ToLogRow(e, occ[k]))
		occ[k]++
	}
	if more && len(kept) > 0 {
		page.NextCursor = nextLogCursor(cur, kept, desc)
	}
	return page, nil
}

// logCursor is the opaque "load more" cursor: the timestamp of the last row
// returned and the keys of the returned rows within a second of it on the
// already-returned side (with repeats). The next page queries a second past
// the cursor (so it works whether the upstream bounds are exclusive or
// inclusive, truncated or precise), over-fetches by len(Seen), and skips
// rows past the cursor and rows in Seen.
type logCursor struct {
	T    string   `json:"t"`
	Seen []string `json:"s,omitempty"`
	at   time.Time
}

func decodeLogCursor(raw string) (*logCursor, error) {
	// A bare timestamp (the pre-2026-10-08 cursor) still works.
	if at, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return &logCursor{T: raw, at: at}, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, err
	}
	var c logCursor
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, err
	}
	if c.at, err = time.Parse(time.RFC3339Nano, c.T); err != nil {
		return nil, err
	}
	return &c, nil
}

// nextLogCursor builds the cursor after kept (this page's rows, in order).
func nextLogCursor(prev *logCursor, kept []platform.LogEntry, desc bool) string {
	at := kept[len(kept)-1].Timestamp
	// Within the widened second past at (bounds included): the rows the next
	// query can return again, which it skips and must not count to the limit.
	near := func(ts time.Time) bool {
		if desc {
			return !ts.Before(at) && !ts.After(at.Add(time.Second))
		}
		return !ts.After(at) && !ts.Before(at.Add(-time.Second))
	}
	c := logCursor{T: at.UTC().Format(time.RFC3339Nano)}
	if prev != nil && near(prev.at) {
		c.Seen = append(c.Seen, prev.Seen...)
	}
	for _, e := range kept {
		if near(e.Timestamp) {
			c.Seen = append(c.Seen, logKey(e))
		}
	}
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

// logKey identifies a log line for de-duplication across pages.
func logKey(e platform.LogEntry) string {
	sum := sha1.Sum([]byte(e.Timestamp.UTC().Format(time.RFC3339Nano) + "\x00" + e.Pod + "\x00" + e.Container + "\x00" + e.Log))
	return hex.EncodeToString(sum[:8])
}

// ToLogRow maps a log entry, recognising web-server access lines. i tells
// identical lines apart in the row ID (their occurrence number).
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
	t, bindings, _, err := s.trackState(ctx, webAppID, trackID, false)
	if err != nil {
		return nil, err
	}
	envs, err := s.pipelineEnvironments(ctx, t.Project)
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
