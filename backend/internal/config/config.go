// Package config loads the BFF configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Target selects the platform the BFF runs against (D14).
type Target string

const (
	// TargetWSO2Cloud runs behind the WSO2 Cloud platform-api-service (PAS).
	TargetWSO2Cloud Target = "wso2cloud"
	// TargetOpenChoreo talks to a plain OpenChoreo API directly (local k3d).
	TargetOpenChoreo Target = "openchoreo"
)

// AuthMode selects how inbound requests are authenticated.
type AuthMode string

const (
	// AuthModeJWT validates the bearer JWT against the IdP JWKS (default).
	AuthModeJWT AuthMode = "jwt"
	// AuthModeDev accepts any request and uses the BFF's client_credentials
	// identity for every platform call (local /dev-login only; refused on wso2cloud).
	AuthModeDev AuthMode = "dev"
)

// Config is the BFF configuration.
type Config struct {
	Target   Target
	AuthMode AuthMode
	Port     int
	BasePath string
	// CORSOrigins are the allowed browser origins (console). Empty = no CORS headers.
	CORSOrigins []string
	LogLevel    string

	// Inbound JWT validation.
	OIDCIssuers   []string
	OIDCJWKSURL   string
	OIDCAudiences []string

	// BFF service identity (client_credentials).
	TokenURL     string
	ClientID     string
	ClientSecret string
	TokenScope   string

	// OpenChoreo API: on wso2cloud this is "<PAS internal URL>/wso2cloud-dp".
	OCAPIURL string
	// OCNamespace is the fixed org namespace on TargetOpenChoreo.
	OCNamespace string
	// LocalOrgHandle is the org handle reported on TargetOpenChoreo when the JWT has none.
	LocalOrgHandle string

	// Platform URLs (TargetWSO2Cloud).
	PASURL           string // PAS internal base (for /wso2cloud-dp/git/... and /meta)
	SecretManagerURL string
	ObsProxyURL      string // cloud-obs-proxy base, e.g. https://.../wso2cloud-obs
	// ObserverURL is the OpenChoreo Observer (TargetOpenChoreo).
	ObserverURL string
	// SecretTargetPlane is the plane the OC Secret API writes to (TargetOpenChoreo).
	SecretTargetPlaneKind string
	SecretTargetPlaneName string

	// GitHubAPIURL / GitHubToken are used for public repositories.
	GitHubAPIURL string
	GitHubToken  string

	// DefaultProject is created for an org on first login when it has no projects.
	DefaultProject string
	// RequestTimeout bounds each inbound request.
	RequestTimeout time.Duration
}

// Load reads the configuration from environment variables. targetOverride
// (the --target flag) wins over TARGET when non-empty.
func Load(targetOverride string) (*Config, error) {
	c := &Config{
		Target:                Target(env("TARGET", string(TargetWSO2Cloud))),
		AuthMode:              AuthMode(env("AUTH_MODE", string(AuthModeJWT))),
		Port:                  envInt("PORT", 9090),
		BasePath:              strings.TrimRight(env("BASE_PATH", "/webapp-hosting/api/v1"), "/"),
		CORSOrigins:           envList("CORS_ALLOWED_ORIGINS"),
		LogLevel:              env("LOG_LEVEL", "info"),
		OIDCIssuers:           envList("OIDC_ISSUER"),
		OIDCJWKSURL:           env("OIDC_JWKS_URL", ""),
		OIDCAudiences:         envList("OIDC_AUDIENCES"),
		TokenURL:              env("OAUTH_TOKEN_URL", ""),
		ClientID:              env("OAUTH_CLIENT_ID", ""),
		ClientSecret:          env("OAUTH_CLIENT_SECRET", ""),
		TokenScope:            env("OAUTH_SCOPE", ""),
		OCAPIURL:              env("OC_API_URL", ""),
		OCNamespace:           env("OC_NAMESPACE", "default"),
		LocalOrgHandle:        env("LOCAL_ORG_HANDLE", "default"),
		PASURL:                strings.TrimRight(env("PAS_URL", ""), "/"),
		SecretManagerURL:      strings.TrimRight(env("SECRET_MANAGER_URL", ""), "/"),
		ObsProxyURL:           strings.TrimRight(env("OBS_PROXY_URL", ""), "/"),
		ObserverURL:           strings.TrimRight(env("OBSERVER_URL", ""), "/"),
		SecretTargetPlaneKind: env("SECRET_TARGET_PLANE_KIND", "ClusterDataPlane"),
		SecretTargetPlaneName: env("SECRET_TARGET_PLANE_NAME", "default"),
		GitHubAPIURL:          strings.TrimRight(env("GITHUB_API_URL", "https://api.github.com"), "/"),
		GitHubToken:           env("GITHUB_TOKEN", ""),
		DefaultProject:        env("DEFAULT_PROJECT", "default"),
		RequestTimeout:        envDuration("REQUEST_TIMEOUT", 60*time.Second),
	}
	if targetOverride != "" {
		c.Target = Target(targetOverride)
	}
	if c.OCAPIURL == "" && c.PASURL != "" {
		c.OCAPIURL = c.PASURL + "/wso2cloud-dp"
	}
	return c, c.validate()
}

func (c *Config) validate() error {
	var missing []string
	need := func(name, v string) {
		if v == "" {
			missing = append(missing, name)
		}
	}
	switch c.Target {
	case TargetWSO2Cloud:
		if c.AuthMode == AuthModeDev {
			return fmt.Errorf("AUTH_MODE=dev is refused when TARGET=wso2cloud")
		}
		need("PAS_URL", c.PASURL)
		need("SECRET_MANAGER_URL", c.SecretManagerURL)
		need("OBS_PROXY_URL", c.ObsProxyURL)
	case TargetOpenChoreo:
		need("OC_API_URL", c.OCAPIURL)
		need("OC_NAMESPACE", c.OCNamespace)
		need("OBSERVER_URL", c.ObserverURL)
	default:
		return fmt.Errorf("TARGET must be %q or %q, got %q", TargetWSO2Cloud, TargetOpenChoreo, c.Target)
	}
	switch c.AuthMode {
	case AuthModeJWT:
		need("OIDC_JWKS_URL", c.OIDCJWKSURL)
		if len(c.OIDCIssuers) == 0 {
			missing = append(missing, "OIDC_ISSUER")
		}
	case AuthModeDev:
	default:
		return fmt.Errorf("AUTH_MODE must be %q or %q", AuthModeJWT, AuthModeDev)
	}
	need("OAUTH_TOKEN_URL", c.TokenURL)
	need("OAUTH_CLIENT_ID", c.ClientID)
	need("OAUTH_CLIENT_SECRET", c.ClientSecret)
	if len(missing) > 0 {
		return fmt.Errorf("missing required configuration: %s", strings.Join(missing, ", "))
	}
	return nil
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(env(k, "")); err == nil {
		return v
	}
	return def
}

func envDuration(k string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(env(k, "")); err == nil {
		return v
	}
	return def
}

func envList(k string) []string {
	var out []string
	for _, p := range strings.Split(env(k, ""), ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
