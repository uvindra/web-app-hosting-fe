package platform

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
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

// PublicGitHub reads public repositories through the GitHub REST API
// (TARGET=openchoreo, and public repos on WSO2 Cloud).
type PublicGitHub struct {
	APIURL string
	Token  string // optional, raises the rate limit
	HTTP   *http.Client
}

func (g *PublicGitHub) client() *http.Client {
	if g.HTTP != nil {
		return g.HTTP
	}
	return &http.Client{Timeout: 20 * time.Second}
}

func (g *PublicGitHub) get(ctx context.Context, path string, out any) error {
	c := &caller{http: g.client()}
	req := func(ctx context.Context) error {
		r, err := http.NewRequestWithContext(ctx, http.MethodGet, g.APIURL+path, nil)
		if err != nil {
			return err
		}
		r.Header.Set("Accept", "application/vnd.github+json")
		if g.Token != "" {
			r.Header.Set("Authorization", "Bearer "+g.Token)
		}
		return c.send(r, out)
	}
	return req(ctx)
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

// CloudGit (TARGET=wso2cloud) uses git-app-service through PAS
// (`/wso2cloud-dp/git/github/*`) for GitHub App repositories and falls back to
// the public GitHub API for public ones.
type CloudGit struct {
	PASURL string
	Public *PublicGitHub
	call   *caller
}

// NewCloudGit builds a CloudGit.
func NewCloudGit(pasURL string, public *PublicGitHub, tokens interface {
	Token() (string, error)
	Invalidate()
}) *CloudGit {
	return &CloudGit{PASURL: pasURL, Public: public, call: newCaller(tokens, true, false)}
}

func (g *CloudGit) url(p string) string { return g.PASURL + "/wso2cloud-dp/git/github" + p }

// GitHubAppEnabled implements GitProvider.
func (g *CloudGit) GitHubAppEnabled() bool { return true }

type installationList struct {
	Items []Installation `json:"items"`
}

// BindInstallations implements GitProvider.
func (g *CloudGit) BindInstallations(ctx context.Context, code string) ([]Installation, error) {
	var out installationList
	err := g.call.do(ctx, http.MethodPost, g.url("/installations"), map[string]string{"code": code}, &out)
	return out.Items, err
}

// ListInstallations implements GitProvider.
func (g *CloudGit) ListInstallations(ctx context.Context) ([]Installation, error) {
	var out installationList
	err := g.call.do(ctx, http.MethodGet, g.url("/installations"), nil, &out)
	return out.Items, err
}

// ListRepos implements GitProvider.
func (g *CloudGit) ListRepos(ctx context.Context, installationID int64) ([]Repository, error) {
	var out struct {
		Items []Repository `json:"items"`
	}
	err := g.call.do(ctx, http.MethodGet, g.url(fmt.Sprintf("/repos?installationId=%d", installationID)), nil, &out)
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
	err = g.call.do(ctx, http.MethodGet, g.url("/branches?"+q.Encode()), nil, &out)
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
	if err := g.call.do(ctx, http.MethodGet, g.url(fmt.Sprintf("/sources/%s/%s/commits?%s", url.PathEscape(project), url.PathEscape(component), q.Encode())), nil, &out); err != nil {
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
	return g.call.do(ctx, http.MethodPut, g.url(fmt.Sprintf("/sources/%s/%s", url.PathEscape(project), url.PathEscape(component))), body, nil)
}

// PrepareBuild implements GitProvider: git-app-service writes the
// `{runName}-git-secret` Secret straight into the org's workflow-plane
// namespace, which the checkout step mounts by that name (ICP pattern). The
// workflow's own SecretReference path is therefore not used ("" returned).
func (g *CloudGit) PrepareBuild(ctx context.Context, repo RepoRef, project, component, runName string) (string, error) {
	if repo.InstallationID == 0 {
		return "", nil
	}
	err := g.call.do(ctx, http.MethodPost, g.url(fmt.Sprintf("/sources/%s/%s/build-secret", url.PathEscape(project), url.PathEscape(component))),
		map[string]string{"workflowRunName": runName}, nil)
	return "", err
}
