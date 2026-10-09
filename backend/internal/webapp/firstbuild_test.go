package webapp

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// appGit is a GitHub App provider that, like the PAS git route on WSO2 Cloud,
// accepts the signed-in user's token only, and records build-secret mints.
type appGit struct {
	mu     sync.Mutex
	mints  []string // run names
	denied int      // calls made without the user's token
}

var errNoUser = errors.New("git route: user token required")

func (g *appGit) userOnly(ctx context.Context) error {
	if auth.UserToken(ctx) == "" || auth.IsServiceIdentity(ctx) {
		g.mu.Lock()
		g.denied++
		g.mu.Unlock()
		return errNoUser
	}
	return nil
}

func (g *appGit) GitHubAppEnabled() bool { return true }
func (g *appGit) BindInstallations(context.Context, string) ([]platform.Installation, error) {
	return nil, nil
}
func (g *appGit) ListInstallations(context.Context) ([]platform.Installation, error) {
	return nil, nil
}
func (g *appGit) ListRepos(context.Context, int64) ([]platform.Repository, error) { return nil, nil }
func (g *appGit) ListBranches(ctx context.Context, _ platform.RepoRef) ([]string, error) {
	return []string{"main", "dev"}, g.userOnly(ctx)
}
func (g *appGit) LatestCommit(ctx context.Context, repo platform.RepoRef, _, _ string) (*platform.Commit, error) {
	if err := g.userOnly(ctx); err != nil {
		return nil, err
	}
	return &platform.Commit{SHA: "c0ffee" + repo.Branch, Message: "m", Author: "a", CommittedAt: time.Unix(0, 0)}, nil
}
func (g *appGit) BindSource(ctx context.Context, _ platform.RepoRef, _, _ string) error {
	return g.userOnly(ctx)
}
func (g *appGit) PrepareBuild(ctx context.Context, _ platform.RepoRef, _, _, runName string) (string, error) {
	if err := g.userOnly(ctx); err != nil {
		return "", err
	}
	g.mu.Lock()
	g.mints = append(g.mints, runName)
	g.mu.Unlock()
	return "", nil
}

// TestFirstBuildMintsGitHubAppSecretWithUserToken: the first build of a
// GitHub App repository (web app create and track create) mints the
// `{run}-git-secret` with the user's JWT on the request, then creates a
// WorkflowRun with exactly that run name; nothing reaches git-app-service
// under the service identity.
func TestFirstBuildMintsGitHubAppSecretWithUserToken(t *testing.T) {
	e := newTestEnv(t)
	git := &appGit{}
	e.svc.p.Git = git
	ctx := auth.WithUserToken(e.ctx, "user-jwt")

	if _, err := e.svc.CreateWebApp(ctx, "default", CreateWebAppInput{
		SourceType: "github", GitOrganization: "acme", Repository: "site", InstallationID: 42, Branch: "main",
		DisplayName: "Site", Handler: "site", BuildPreset: "static", Port: 8080,
	}); err != nil {
		t.Fatal(err)
	}
	e.svc.WaitBackground()
	if _, err := e.svc.CreateTrack(ctx, "site", "dev"); err != nil {
		t.Fatal(err)
	}
	e.svc.WaitBackground()

	git.mu.Lock()
	mints, denied := append([]string(nil), git.mints...), git.denied
	git.mu.Unlock()
	if denied != 0 {
		t.Fatalf("%d git-app-service calls were made without the user's token", denied)
	}
	if len(mints) != 2 {
		t.Fatalf("build secrets minted for %v, want one per track", mints)
	}
	runs := map[string]map[string]any{}
	for _, r := range e.oc.List("workflowruns") {
		runs[nameOf(r)] = r
	}
	if len(runs) != 2 {
		t.Fatalf("workflow runs = %v, want 2", keys(runs))
	}
	for _, m := range mints {
		r, ok := runs[m]
		if !ok {
			t.Fatalf("minted secret for run %q but runs are %v", m, keys(runs))
		}
		repo := nestedMap(r, "spec", "workflow", "parameters", "repository")
		rev, _ := repo["revision"].(map[string]any)
		if repo["secretRef"] != "" || rev["commit"] == "" {
			t.Fatalf("run %s repository = %v", m, repo)
		}
	}
}

// TestFirstBuildNotStartedWithoutUserToken: when the mint can't be made with
// the user's token the first build is skipped (logged), not retried under the
// service identity, and the create still succeeds.
func TestFirstBuildNotStartedWithoutUserToken(t *testing.T) {
	e := newTestEnv(t)
	git := &appGit{}
	e.svc.p.Git = git
	// e.ctx has no user token; BindSource is the first rejected call, so drive
	// the first build directly with a created track.
	e.addTrack("site", "site", "main", true)
	tr, err := e.svc.getTrack(e.ctx, "site", "site")
	if err != nil {
		t.Fatal(err)
	}
	tr.InstallationID = 42
	e.svc.firstBuild(e.ctx, *tr)
	e.svc.WaitBackground()
	if n := len(e.oc.List("workflowruns")); n != 0 {
		t.Fatalf("%d workflow runs created without clone credentials", n)
	}
	git.mu.Lock()
	defer git.mu.Unlock()
	if len(git.mints) != 0 {
		t.Fatalf("mints = %v", git.mints)
	}
}

func keys(m map[string]map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func nestedMap(m map[string]any, path ...string) map[string]any {
	cur := m
	for _, p := range path {
		next, _ := cur[p].(map[string]any)
		if next == nil {
			return map[string]any{}
		}
		cur = next
	}
	return cur
}
