// Package app wires the BFF from its configuration.
package app

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/api"
	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/config"
	"github.com/wso2/web-app-hosting/backend/internal/oauth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
	"github.com/wso2/web-app-hosting/backend/internal/webapp"
)

// Build wires the target adapters (D14) into the API server.
func Build(cfg *config.Config) (*api.Server, error) {
	if cfg.Target == config.TargetOpenChoreo {
		resolveLocalhostToLoopback()
	}
	tokens := oauth.NewTokenProvider(cfg.TokenURL, cfg.ClientID, cfg.ClientSecret, cfg.TokenScope).WithBasicAuth(cfg.TokenAuthMethod == "client_secret_basic")
	cloud := cfg.Target == config.TargetWSO2Cloud
	dev := cfg.AuthMode == config.AuthModeDev

	ocCfg := openchoreo.Config{
		BaseURL:        cfg.OCAPIURL,
		ServiceTokens:  tokens,
		ResourceLabels: map[string]string{webapp.LabelProduct: webapp.ProductName},
	}
	if dev {
		ocCfg.Strategy = openchoreo.ServiceOnlyStrategy
	}
	if cloud {
		ocCfg.Host = cfg.PASHost
		ocCfg.ImpersonateOrg = func(ctx context.Context) string {
			if o := auth.OrgFrom(ctx); o != nil {
				return o.UUID
			}
			return ""
		}
	}
	oc, err := openchoreo.New(ocCfg)
	if err != nil {
		return nil, err
	}

	public := &platform.PublicGitHub{APIURL: cfg.GitHubAPIURL, Token: cfg.GitHubToken}
	p := &platform.Platform{Target: string(cfg.Target)}
	if cloud {
		p.Org = &platform.CloudOrgResolver{OC: oc}
		p.Git = platform.NewCloudGit(cfg.PASURL, cfg.PASHost, public, tokens)
		p.Secrets = platform.NewSecretManagerStore(cfg.SecretManagerURL, tokens)
		p.Observability = platform.NewObserverLogs(cfg.ObsProxyURL, tokens, true, false)
		p.BillingEnabled = true
		if cfg.BillingURL == "" {
			// Defence in depth: a missing billing URL must not crash-loop the
			// BFF. Fail closed — every org gates like the free plan.
			slog.Error("BILLING_API_BASE_URL is not set: billing is unavailable, every org is treated as on the FREE plan (paid features are blocked); set it in the webapp-service release binding")
			p.Billing = platform.UnconfiguredBilling{}
		} else {
			p.Billing = platform.NewCloudBilling(cfg.BillingURL, webapp.ProductName, cfg.FreePlanCodes, tokens)
		}
	} else {
		p.Org = platform.StaticOrgResolver{Namespace: cfg.OCNamespace, Handle: cfg.LocalOrgHandle}
		p.Git = public
		p.Secrets = &platform.OCSecretStore{OC: oc, PlaneKind: cfg.SecretTargetPlaneKind, PlaneName: cfg.SecretTargetPlaneName}
		obsURL := cfg.ObserverURL
		p.Observability = platform.NewObserverLogs(obsURL, tokens, false, dev)
		p.Billing = platform.StaticBilling{Type: cfg.LocalPlan}
	}

	svc := webapp.New(oc, p, webapp.Options{
		Profile:        platformres.Profile{Cloud: cloud},
		DefaultProject: cfg.DefaultProject,
		PreferHTTP:     !cloud,
	})

	var authn api.Authenticator
	if dev {
		slog.Warn("AUTH_MODE=dev: inbound requests are NOT authenticated; local use only")
		authn = api.DevAuthenticator{}
	} else {
		if len(cfg.OIDCAudiences) == 0 {
			slog.Info("OIDC_AUDIENCES not set: token audience is not checked")
		}
		authn = api.JWTAuthenticator{Verifier: &auth.Verifier{JWKS: auth.NewJWKSCache(cfg.OIDCJWKSURL), Issuers: cfg.OIDCIssuers, Audiences: cfg.OIDCAudiences}}
	}
	return &api.Server{
		BasePath: cfg.BasePath, Service: svc, Auth: authn, Orgs: p.Org,
		CORSOrigins: cfg.CORSOrigins, RequestTimeout: cfg.RequestTimeout,
	}, nil
}

// resolveLocalhostToLoopback makes every `*.localhost` host (RFC 6761) dial
// 127.0.0.1, as browsers and curl do: local OpenChoreo exposes its API,
// ThunderID and Observer as *.openchoreo.localhost, which Go's resolver
// does not map to loopback without /etc/hosts entries.
func resolveLocalhostToLoopback() {
	t, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return
	}
	dialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	t.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err == nil && (host == "localhost" || strings.HasSuffix(host, ".localhost")) {
			addr = net.JoinHostPort("127.0.0.1", port)
		}
		return dialer.DialContext(ctx, network, addr)
	}
}
