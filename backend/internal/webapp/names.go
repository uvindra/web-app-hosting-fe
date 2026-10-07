// Package webapp is the Web App Hosting domain layer: it maps the console's
// web apps, deployment tracks, builds and deployments onto OpenChoreo
// resources. The BFF is stateless (P0): OpenChoreo is the source of truth.
//
//   - Web app = the set of track Components sharing label LabelWebApp=<handle>.
//   - Track (D3) = one Component per branch: `<handle>` for the default track,
//     `<handle>-<branch-slug>` for others (always use the returned name).
//   - Build = a WorkflowRun labelled with the track Component.
//   - Deployment = the track Component's ReleaseBinding per environment; a
//     build is deployed by cutting a ComponentRelease named after the run.
package webapp

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

// Product label value (D10) and our labels/annotations.
const (
	ProductName  = "web-app-hosting"
	LabelProduct = "cloud.wso2.com/product-name"

	LabelWebApp = "web-app-hosting.wso2.com/web-app"
	LabelTrack  = "web-app-hosting.wso2.com/track"

	LabelOCProject   = "openchoreo.dev/project"
	LabelOCComponent = "openchoreo.dev/component"

	annPrefix          = "web-app-hosting.wso2.com/"
	AnnDisplayName     = annPrefix + "display-name"
	AnnDescription     = annPrefix + "description"
	AnnPreset          = annPrefix + "preset"
	AnnDefaultTrack    = annPrefix + "default-track"
	AnnPort            = annPrefix + "port"
	AnnSourceType      = annPrefix + "source-type"
	AnnRepoURL         = annPrefix + "repo-url"
	AnnInstallationID  = annPrefix + "installation-id"
	AnnAutoDeploy      = annPrefix + "auto-deploy"
	AnnBranch          = annPrefix + "branch"
	AnnCommitSHA       = annPrefix + "commit-sha"
	AnnCommitMessage   = annPrefix + "commit-message"
	AnnCommitAuthor    = annPrefix + "commit-author"
	AnnCommitDate      = annPrefix + "commit-date"
	AnnAutoDeployState = annPrefix + "auto-deploy-state"
	AnnConfigs         = annPrefix + "configs"

	// OpenChoreo annotations set by generate-workload on the WorkflowRun.
	AnnOCWorkload = "openchoreo.dev/workload"

	ocDisplayName = "openchoreo.dev/display-name"
	ocDescription = "openchoreo.dev/description"
)

var (
	nonDNS    = regexp.MustCompile(`[^a-z0-9-]+`)
	dashes    = regexp.MustCompile(`-+`)
	handleRE  = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)
	maxHandle = 40
)

// Slug turns s into a DNS-label-safe slug of at most max characters. When
// truncation or character replacement loses information a short hash keeps
// distinct inputs distinct.
func Slug(s string, max int) string {
	lower := strings.ToLower(strings.TrimSpace(s))
	out := dashes.ReplaceAllString(nonDNS.ReplaceAllString(lower, "-"), "-")
	out = strings.Trim(out, "-")
	if out == "" {
		out = "x"
	}
	if out == lower && len(out) <= max {
		return out
	}
	sum := sha256.Sum256([]byte(s))
	h := hex.EncodeToString(sum[:])[:6]
	if len(out) > max-7 {
		out = strings.Trim(out[:max-7], "-")
	}
	return out + "-" + h
}

// ValidHandle reports whether h is a valid web app / project handle.
func ValidHandle(h string) bool { return len(h) <= maxHandle && handleRE.MatchString(h) }

// TrackComponentName is the desired Component name for a track.
func TrackComponentName(handle, branch string, isDefault bool) string {
	if isDefault {
		return handle
	}
	return handle + "-" + Slug(branch, 20)
}
