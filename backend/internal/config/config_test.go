package config

import (
	"strings"
	"testing"
)

// clearEnv blanks every variable Load reads so the caller's shell can't leak
// into a test (env treats an empty value as unset).
func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"TARGET", "AUTH_MODE", "PORT", "BASE_PATH", "CORS_ALLOWED_ORIGINS", "LOG_LEVEL",
		"OIDC_ISSUER", "OIDC_JWKS_URL", "OIDC_AUDIENCES",
		"OAUTH_TOKEN_URL", "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET", "OAUTH_SCOPE", "OAUTH_TOKEN_AUTH_METHOD",
		"OC_API_URL", "OC_NAMESPACE", "LOCAL_ORG_HANDLE", "PAS_URL", "SECRET_MANAGER_URL",
		"OBS_PROXY_URL", "OBSERVER_URL", "BILLING_API_BASE_URL", "BILLING_FREE_PLAN_CODES", "LOCAL_PLAN",
	} {
		t.Setenv(k, "")
	}
}

func setCloudEnv(t *testing.T) {
	t.Helper()
	clearEnv(t)
	for k, v := range map[string]string{
		"TARGET":               "wso2cloud",
		"OIDC_ISSUER":          "https://idp.example/oauth2/token",
		"OIDC_JWKS_URL":        "https://idp.example/oauth2/jwks",
		"OAUTH_TOKEN_URL":      "https://idp.example/oauth2/token",
		"OAUTH_CLIENT_ID":      "client",
		"OAUTH_CLIENT_SECRET":  "secret",
		"PAS_URL":              "https://internal-gw.example/dev-wso2cloud-platform-api-service-platform-internal-endpoint/",
		"SECRET_MANAGER_URL":   "https://sm.example",
		"OBS_PROXY_URL":        "https://obs.example/wso2cloud-obs",
		"BILLING_API_BASE_URL": "https://billing.example/api/v1",
	} {
		t.Setenv(k, v)
	}
}

// The PAS internal endpoint's gateway already maps its base to PAS
// /wso2cloud-dp, so the OC API base must be PAS_URL itself.
func TestOCAPIURLDefaultsToPASURLWithoutPrefix(t *testing.T) {
	setCloudEnv(t)
	c, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	want := "https://internal-gw.example/dev-wso2cloud-platform-api-service-platform-internal-endpoint"
	if c.PASURL != want || c.OCAPIURL != want {
		t.Fatalf("PASURL=%q OCAPIURL=%q, want both %q", c.PASURL, c.OCAPIURL, want)
	}
	if strings.Contains(c.OCAPIURL, "/wso2cloud-dp") {
		t.Fatalf("OCAPIURL must not carry /wso2cloud-dp: %q", c.OCAPIURL)
	}
}

func TestOCAPIURLExplicitWins(t *testing.T) {
	setCloudEnv(t)
	t.Setenv("OC_API_URL", "https://other.example/base/")
	c, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	if c.OCAPIURL != "https://other.example/base" {
		t.Fatalf("OCAPIURL = %q", c.OCAPIURL)
	}
}

func TestCloudRequiresPASURL(t *testing.T) {
	setCloudEnv(t)
	t.Setenv("PAS_URL", "")
	if _, err := Load(""); err == nil || !strings.Contains(err.Error(), "PAS_URL") {
		t.Fatalf("want missing PAS_URL error, got %v", err)
	}
}

// The local target talks to the OC API directly and is unaffected.
func TestOpenChoreoTargetUsesOCAPIURLAsIs(t *testing.T) {
	clearEnv(t)
	for k, v := range map[string]string{
		"TARGET":              "openchoreo",
		"AUTH_MODE":           "dev",
		"OAUTH_TOKEN_URL":     "http://thunder.openchoreo.localhost:8080/oauth2/token",
		"OAUTH_CLIENT_ID":     "client",
		"OAUTH_CLIENT_SECRET": "secret",
		"OC_API_URL":          "http://api.openchoreo.localhost:8080",
		"OBSERVER_URL":        "http://observer.openchoreo.localhost:8080",
	} {
		t.Setenv(k, v)
	}
	c, err := Load("")
	if err != nil {
		t.Fatal(err)
	}
	if c.OCAPIURL != "http://api.openchoreo.localhost:8080" {
		t.Fatalf("OCAPIURL = %q", c.OCAPIURL)
	}
}
