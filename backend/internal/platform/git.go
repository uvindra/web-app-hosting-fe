package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

// ErrGitHubAppUnavailable is returned for GitHub App calls on a target without one.
var ErrGitHubAppUnavailable = errors.New("GitHub App integration is not available on this platform")

var githubRepoRE = regexp.MustCompile(`^(?:https?://)?(?:www\.)?github\.com/([^/\s]+)/([^/\s#?]+?)(?:\.git)?/?$`)

// ParseGitHubURL returns owner/repo for a github.com URL.
func ParseGitHubURL(u string) (owner, repo string, ok bool) {
	m := githubRepoRE.FindStringSubmatch(strings.TrimSpace(u))
	if m == nil {
		return "", "", false
	}
	return m[1], m[2], true
}

// ErrRateLimited is returned when the GitHub API rate limit is exhausted.
var ErrRateLimited = errors.New("GitHub API rate limit exceeded")

// RateLimitError is a GitHub rate-limit response (403 or 429 with
// X-RateLimit-Remaining: 0, or a secondary rate limit).
type RateLimitError struct {
	// Reset is when the limit resets (zero when unknown).
	Reset time.Time
}

func (e *RateLimitError) Error() string {
	msg := "GitHub API rate limit exceeded"
	if !e.Reset.IsZero() {
		if d := time.Until(e.Reset).Round(time.Minute); d > 0 {
			msg += fmt.Sprintf("; try again in about %s", d)
		} else {
			msg += "; try again shortly"
		}
	}
	return msg + " (set GITHUB_TOKEN on the BFF to raise the limit)"
}

// Unwrap lets errors.Is match ErrRateLimited.
func (e *RateLimitError) Unwrap() error { return ErrRateLimited }

type freshKey struct{}

// WithFreshReads makes cached git reads (branches, latest commit) bypass
// the cache, e.g. when a build pins the branch head.
func WithFreshReads(ctx context.Context) context.Context {
	return context.WithValue(ctx, freshKey{}, true)
}

func fresh(ctx context.Context) bool { v, _ := ctx.Value(freshKey{}).(bool); return v }

// DefaultGitHubCacheTTL is how long public GitHub API responses are reused.
const DefaultGitHubCacheTTL = 60 * time.Second

// PublicGitHub reads public repositories through the GitHub REST API
// (TARGET=openchoreo, and public repos on WSO2 Cloud). Responses (including
// 404s) are cached for CacheTTL per request path, and concurrent identical
// requests share one upstream call: the unauthenticated API allows only
// 60 requests an hour.
type PublicGitHub struct {
	APIURL string
	Token  string // optional, raises the rate limit
	HTTP   *http.Client
	// CacheTTL is the response cache lifetime (0 = DefaultGitHubCacheTTL, <0 = off).
	CacheTTL time.Duration

	mu    sync.Mutex
	cache map[string]ghCacheEntry
	group singleflight.Group
	now   func() time.Time
}

type ghCacheEntry struct {
	body    []byte
	err     error
	expires time.Time
}

func (g *PublicGitHub) client() *http.Client {
	if g.HTTP != nil {
		return g.HTTP
	}
	return &http.Client{Timeout: 15 * time.Second}
}

func (g *PublicGitHub) clock() time.Time {
	if g.now != nil {
		return g.now()
	}
	return time.Now()
}

func (g *PublicGitHub) ttl() time.Duration {
	if g.CacheTTL == 0 {
		return DefaultGitHubCacheTTL
	}
	return g.CacheTTL
}

func (g *PublicGitHub) get(ctx context.Context, path string, out any) error {
	raw, err := g.getRaw(ctx, path)
	if err != nil {
		return err
	}
	if out == nil || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	return json.Unmarshal(raw, out)
}

// getRaw returns the response body for path, from the cache when fresh.
func (g *PublicGitHub) getRaw(ctx context.Context, path string) ([]byte, error) {
	useCache := g.ttl() > 0
	if useCache && !fresh(ctx) {
		g.mu.Lock()
		e, ok := g.cache[path]
		g.mu.Unlock()
		if ok && g.clock().Before(e.expires) {
			return e.body, e.err
		}
	}
	v, err, _ := g.group.Do(path, func() (any, error) {
		body, err := g.fetch(ctx, path)
		// Cache successes and "not found" (a mistyped repo URL); never
		// transient failures or rate limits.
		if useCache && (err == nil || errors.Is(err, openchoreo.ErrNotFound)) {
			g.mu.Lock()
			if g.cache == nil {
				g.cache = map[string]ghCacheEntry{}
			}
			now := g.clock()
			for k, e := range g.cache {
				if !now.Before(e.expires) {
					delete(g.cache, k)
				}
			}
			g.cache[path] = ghCacheEntry{body: body, err: err, expires: now.Add(g.ttl())}
			g.mu.Unlock()
		}
		return body, err
	})
	if err != nil {
		return nil, err
	}
	return v.([]byte), nil
}

func (g *PublicGitHub) fetch(ctx context.Context, path string) ([]byte, error) {
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, g.APIURL+path, nil)
	if err != nil {
		return nil, err
	}
	r.Header.Set("Accept", "application/vnd.github+json")
	if g.Token != "" {
		r.Header.Set("Authorization", "Bearer "+g.Token)
	}
	resp, err := g.client().Do(r)
	if err != nil {
		return nil, fmt.Errorf("GitHub API: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return raw, nil
	}
	if rl := rateLimitOf(resp, raw); rl != nil {
		return nil, rl
	}
	return nil, openchoreo.NewAPIError(resp.StatusCode, raw)
}

// rateLimitOf recognises GitHub's primary (403/429 + X-RateLimit-Remaining: 0)
// and secondary (403/429 + "rate limit" message or Retry-After) rate limits.
func rateLimitOf(resp *http.Response, body []byte) *RateLimitError {
	if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusTooManyRequests {
		return nil
	}
	h := resp.Header
	limited := h.Get("X-RateLimit-Remaining") == "0" || h.Get("Retry-After") != "" ||
		resp.StatusCode == http.StatusTooManyRequests || strings.Contains(strings.ToLower(string(body)), "rate limit")
	if !limited {
		return nil
	}
	e := &RateLimitError{}
	if s, err := strconv.ParseInt(h.Get("X-RateLimit-Reset"), 10, 64); err == nil && s > 0 {
		e.Reset = time.Unix(s, 0)
	} else if s, err := strconv.Atoi(h.Get("Retry-After")); err == nil && s > 0 {
		e.Reset = time.Now().Add(time.Duration(s) * time.Second)
	}
	return e
}

// GitHubAppEnabled implements GitProvider.
func (g *PublicGitHub) GitHubAppEnabled() bool { return false }

// BindInstallations implements GitProvider.
func (g *PublicGitHub) BindInstallations(context.Context, string) ([]Installation, error) {
	return nil, ErrGitHubAppUnavailable
}

// ListInstallations implements GitProvider.
func (g *PublicGitHub) ListInstallations(context.Context) ([]Installation, error) {
	return []Installation{}, nil
}

// ListRepos implements GitProvider.
func (g *PublicGitHub) ListRepos(context.Context, int64) ([]Repository, error) {
	return nil, ErrGitHubAppUnavailable
}

// ListBranches implements GitProvider.
func (g *PublicGitHub) ListBranches(ctx context.Context, repo RepoRef) ([]string, error) {
	owner, name, err := ownerRepo(repo)
	if err != nil {
		return nil, err
	}
	var out []string
	for page := 1; page <= 10; page++ {
		var items []struct {
			Name string `json:"name"`
		}
		if err := g.get(ctx, fmt.Sprintf("/repos/%s/%s/branches?per_page=100&page=%d", url.PathEscape(owner), url.PathEscape(name), page), &items); err != nil {
			return nil, err
		}
		for _, b := range items {
			out = append(out, b.Name)
		}
		if len(items) < 100 {
			break
		}
	}
	return out, nil
}

// LatestCommit implements GitProvider.
func (g *PublicGitHub) LatestCommit(ctx context.Context, repo RepoRef, _, _ string) (*Commit, error) {
	owner, name, err := ownerRepo(repo)
	if err != nil {
		return nil, err
	}
	var c struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Name string    `json:"name"`
				Date time.Time `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}
	if err := g.get(ctx, fmt.Sprintf("/repos/%s/%s/commits/%s", url.PathEscape(owner), url.PathEscape(name), url.PathEscape(repo.Branch)), &c); err != nil {
		return nil, err
	}
	return &Commit{SHA: c.SHA, Message: firstLine(c.Commit.Message), Author: c.Commit.Author.Name, CommittedAt: c.Commit.Author.Date}, nil
}

// BindSource implements GitProvider (nothing to persist for public repos).
func (g *PublicGitHub) BindSource(context.Context, RepoRef, string, string) error { return nil }

// PrepareBuild implements GitProvider: public repos clone anonymously.
func (g *PublicGitHub) PrepareBuild(context.Context, RepoRef, string, string, string) (string, error) {
	return "", nil
}

func ownerRepo(repo RepoRef) (string, string, error) {
	if repo.Owner != "" && repo.Repo != "" {
		return repo.Owner, repo.Repo, nil
	}
	o, r, ok := ParseGitHubURL(repo.URL)
	if !ok {
		return "", "", fmt.Errorf("only GitHub repositories are supported (got %q)", repo.URL)
	}
	return o, r, nil
}

func firstLine(s string) string {
	s, _, _ = strings.Cut(s, "\n")
	return strings.TrimSpace(s)
}

// CloudGit (TARGET=wso2cloud) uses git-app-service through PAS for GitHub App
// repositories and falls back to the public GitHub API for public ones. Calls
// go to `{PASURL}/git/github/*`: the PAS internal endpoint's gateway prepends
// `/wso2cloud-dp`, reaching the PAS route `/wso2cloud-dp/git/github/*`
// (wso2cloud-deployment docs/private-repo-github-app.md: "do not add it
// yourself"). That route accepts user JWTs only (no impersonation), so every
// CloudGit call must run on a request context carrying the user's token.
type CloudGit struct {
	PASURL string
	Public *PublicGitHub
	call   *caller
}

// NewCloudGit builds a CloudGit.
// pasHost, when set, is sent as the Host header (the internal gateway routes
// by virtual host).
func NewCloudGit(pasURL, pasHost string, public *PublicGitHub, tokens interface {
	Token() (string, error)
	Invalidate()
}) *CloudGit {
	call := newCaller(tokens, true, false)
	call.host = pasHost
	return &CloudGit{PASURL: pasURL, Public: public, call: call}
}

func (g *CloudGit) url(p string) string { return g.PASURL + "/git/github" + p }

// ErrGitUserTokenRequired: a GitHub App (git-app-service) call was made
// without the signed-in user's token, e.g. from a background job. The PAS git
// route has no impersonation and git-app-service takes the org from the
// user's JWT, so the BFF's service identity would be rejected; such work must
// run on a user request instead.
var ErrGitUserTokenRequired = errors.New("GitHub App repository access needs the signed-in user's token; retry the action from the console")

// do calls git-app-service with the caller's user JWT, refusing the BFF's
// service identity up front (see ErrGitUserTokenRequired).
func (g *CloudGit) do(ctx context.Context, method, url string, body, out any) error {
	if auth.UserToken(ctx) == "" || auth.IsServiceIdentity(ctx) {
		return fmt.Errorf("%s %s: %w", method, url, ErrGitUserTokenRequired)
	}
	return g.call.do(ctx, method, url, body, out)
}

// GitHubAppEnabled implements GitProvider.
func (g *CloudGit) GitHubAppEnabled() bool { return true }

type installationList struct {
	Items []Installation `json:"items"`
}

// BindInstallations implements GitProvider.
func (g *CloudGit) BindInstallations(ctx context.Context, code string) ([]Installation, error) {
	var out installationList
	err := g.do(ctx, http.MethodPost, g.url("/installations"), map[string]string{"code": code}, &out)
	return out.Items, err
}

// ListInstallations implements GitProvider.
func (g *CloudGit) ListInstallations(ctx context.Context) ([]Installation, error) {
	var out installationList
	err := g.do(ctx, http.MethodGet, g.url("/installations"), nil, &out)
	return out.Items, err
}

// ListRepos implements GitProvider.
func (g *CloudGit) ListRepos(ctx context.Context, installationID int64) ([]Repository, error) {
	var out struct {
		Items []Repository `json:"items"`
	}
	err := g.do(ctx, http.MethodGet, g.url(fmt.Sprintf("/repos?installationId=%d", installationID)), nil, &out)
	return out.Items, err
}

// ListBranches implements GitProvider.
func (g *CloudGit) ListBranches(ctx context.Context, repo RepoRef) ([]string, error) {
	if repo.InstallationID == 0 {
		return g.Public.ListBranches(ctx, repo)
	}
	owner, name, err := ownerRepo(repo)
	if err != nil {
		return nil, err
	}
	var out struct {
		Items []string `json:"items"`
	}
	q := url.Values{"installationId": {fmt.Sprint(repo.InstallationID)}, "owner": {owner}, "repo": {name}}
	err = g.do(ctx, http.MethodGet, g.url("/branches?"+q.Encode()), nil, &out)
	return out.Items, err
}

// LatestCommit implements GitProvider.
func (g *CloudGit) LatestCommit(ctx context.Context, repo RepoRef, project, component string) (*Commit, error) {
	if repo.InstallationID == 0 {
		return g.Public.LatestCommit(ctx, repo, project, component)
	}
	var out struct {
		Items []struct {
			SHA        string `json:"sha"`
			Message    string `json:"message"`
			AuthorName string `json:"authorName"`
			AuthorDate string `json:"authorDate"`
		} `json:"items"`
	}
	q := url.Values{"sha": {repo.Branch}, "limit": {"1"}}
	if err := g.do(ctx, http.MethodGet, g.url(fmt.Sprintf("/sources/%s/%s/commits?%s", url.PathEscape(project), url.PathEscape(component), q.Encode())), nil, &out); err != nil {
		return nil, err
	}
	if len(out.Items) == 0 {
		return nil, fmt.Errorf("no commits on branch %q", repo.Branch)
	}
	c := out.Items[0]
	t, _ := time.Parse(time.RFC3339, c.AuthorDate)
	return &Commit{SHA: c.SHA, Message: firstLine(c.Message), Author: c.AuthorName, CommittedAt: t}, nil
}

// BindSource implements GitProvider.
func (g *CloudGit) BindSource(ctx context.Context, repo RepoRef, project, component string) error {
	if repo.InstallationID == 0 {
		return nil
	}
	owner, name, err := ownerRepo(repo)
	if err != nil {
		return err
	}
	body := map[string]any{
		"installationId": repo.InstallationID, "owner": owner, "repo": name, "branch": repo.Branch,
		"appPath": repo.AppPath, "repositoryUrl": repo.URL,
	}
	return g.do(ctx, http.MethodPut, g.url(fmt.Sprintf("/sources/%s/%s", url.PathEscape(project), url.PathEscape(component))), body, nil)
}

// PrepareBuild implements GitProvider: git-app-service writes the
// `{runName}-git-secret` Secret straight into the org's workflow-plane
// namespace, which the checkout step mounts by that name (ICP pattern). The
// workflow's own SecretReference path is therefore not used ("" returned).
func (g *CloudGit) PrepareBuild(ctx context.Context, repo RepoRef, project, component, runName string) (string, error) {
	if repo.InstallationID == 0 {
		return "", nil
	}
	err := g.do(ctx, http.MethodPost, g.url(fmt.Sprintf("/sources/%s/%s/build-secret", url.PathEscape(project), url.PathEscape(component))),
		map[string]string{"workflowRunName": runName}, nil)
	return "", err
}
