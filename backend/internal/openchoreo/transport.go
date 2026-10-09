// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
// Adapted from App Factory internal/clients/openchoreo/transport.go (see doc.go).

package openchoreo

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// AuthMode is the credential class the transport applies to one request.
type AuthMode int

const (
	// AuthModeNone sends no bearer.
	AuthModeNone AuthMode = iota
	// AuthModeUserJWT forwards the inbound user JWT (no impersonation header).
	AuthModeUserJWT
	// AuthModeServiceM2M sends the BFF's own client_credentials token, plus
	// X-Impersonate-Org when an ImpersonateOrg resolver is configured.
	AuthModeServiceM2M
)

// TokenSource is the M2M token contract (satisfied by *oauth.TokenProvider).
type TokenSource interface {
	Token() (string, error)
	Invalidate()
}

// Config drives client construction.
type Config struct {
	// BaseURL is the OC API root the generated /api/v1/... paths are appended to:
	// the OC API URL locally, or the PAS internal endpoint base on WSO2 Cloud
	// (its gateway maps to PAS /wso2cloud-dp; never append that prefix).
	BaseURL string
	// ServiceTokens supplies the BFF's M2M token. nil disables AuthModeServiceM2M.
	ServiceTokens TokenSource
	// Strategy picks the credential class per request. nil = DefaultStrategy.
	Strategy func(ctx context.Context) AuthMode
	// ImpersonateOrg returns the org UUID sent as X-Impersonate-Org on M2M
	// requests (WSO2 Cloud). nil (plain OpenChoreo) sends no header.
	ImpersonateOrg func(ctx context.Context) string
	// ResourceLabels are stamped on every object the client writes (D10).
	ResourceLabels map[string]string
	// HTTPClient overrides the inner HTTP client (tests).
	HTTPClient *http.Client
	Retry      RequestRetryConfig
}

// DefaultStrategy forwards the user JWT on request-scoped calls and uses the
// service identity for background calls (or when there is no user JWT).
func DefaultStrategy(ctx context.Context) AuthMode {
	if auth.IsServiceIdentity(ctx) || auth.UserToken(ctx) == "" {
		return AuthModeServiceM2M
	}
	return AuthModeUserJWT
}

// ServiceOnlyStrategy always uses the BFF's service identity (AUTH_MODE=dev).
func ServiceOnlyStrategy(context.Context) AuthMode { return AuthModeServiceM2M }

func newGenClient(cfg Config) (*gen.ClientWithResponses, error) {
	if cfg.BaseURL == "" {
		return nil, errors.New("openchoreo: Config.BaseURL is required")
	}
	inner := cfg.HTTPClient
	if inner == nil {
		inner = &http.Client{}
	}
	retry := cfg.Retry
	if retry.RetryOnStatus == nil {
		retry.RetryOnStatus = func(method string, status int) bool {
			if status == http.StatusUnauthorized {
				// A cached service token may have been revoked; refetch and retry.
				if cfg.ServiceTokens != nil {
					slog.Info("openchoreo: 401, invalidating cached service token and retrying")
					cfg.ServiceTokens.Invalidate()
				}
				return true
			}
			return defaultRetryOnStatus(method, status)
		}
	}
	return gen.NewClientWithResponses(
		strings.TrimRight(cfg.BaseURL, "/"),
		gen.WithHTTPClient(newRetryableHTTPClient(inner, retry)),
		gen.WithRequestEditorFn(authRequestEditor(cfg)),
	)
}

// authRequestEditor sets Authorization (and X-Impersonate-Org on WSO2 Cloud
// M2M calls) and X-Use-OpenAPI on every request. It runs on every retry
// attempt, so a 401 → Invalidate → retry picks up a fresh token.
func authRequestEditor(cfg Config) func(ctx context.Context, req *http.Request) error {
	strategy := cfg.Strategy
	if strategy == nil {
		strategy = DefaultStrategy
	}
	return func(ctx context.Context, req *http.Request) error {
		req.Header.Set("X-Use-OpenAPI", "true")
		switch strategy(ctx) {
		case AuthModeUserJWT:
			tok := auth.UserToken(ctx)
			if tok == "" {
				return errors.New("openchoreo: user JWT mode selected but no user JWT in context")
			}
			req.Header.Set("Authorization", "Bearer "+tok)
		case AuthModeServiceM2M:
			if cfg.ImpersonateOrg != nil {
				if org := cfg.ImpersonateOrg(ctx); org != "" {
					req.Header.Set("X-Impersonate-Org", org)
				}
			}
			if cfg.ServiceTokens == nil {
				return errors.New("openchoreo: service identity selected but no service credentials configured")
			}
			tok, err := cfg.ServiceTokens.Token()
			if err != nil {
				return fmt.Errorf("openchoreo: service token: %w", err)
			}
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		return nil
	}
}
