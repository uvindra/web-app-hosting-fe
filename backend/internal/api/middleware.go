package api

import (
	"context"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// Authenticator verifies the inbound request and returns its claims and the
// bearer token to forward ("" in dev mode).
type Authenticator interface {
	Authenticate(r *http.Request) (*auth.Claims, string, error)
}

// JWTAuthenticator validates bearer JWTs (AUTH_MODE=jwt).
type JWTAuthenticator struct{ Verifier *auth.Verifier }

// Authenticate implements Authenticator.
func (a JWTAuthenticator) Authenticate(r *http.Request) (*auth.Claims, string, error) {
	h := r.Header.Get("Authorization")
	tok, ok := strings.CutPrefix(h, "Bearer ")
	if !ok || strings.TrimSpace(tok) == "" {
		return nil, "", errMissingToken
	}
	tok = strings.TrimSpace(tok)
	c, err := a.Verifier.Verify(tok)
	if err != nil {
		return nil, "", err
	}
	return c, tok, nil
}

// DevAuthenticator accepts every request (AUTH_MODE=dev, local only); all
// platform calls then use the BFF's client_credentials identity.
type DevAuthenticator struct{}

// Authenticate implements Authenticator.
func (DevAuthenticator) Authenticate(*http.Request) (*auth.Claims, string, error) {
	return &auth.Claims{Subject: "dev-user"}, "", nil
}

type authError string

func (e authError) Error() string { return string(e) }

const errMissingToken = authError("missing bearer token")

func withAuth(a Authenticator, orgs platform.OrgResolver, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, tok, err := a.Authenticate(r)
		if err != nil {
			slog.InfoContext(r.Context(), "unauthenticated request", "path", r.URL.Path, "error", err)
			w.Header().Set("WWW-Authenticate", `Bearer realm="web-app-hosting"`)
			writeJSON(w, http.StatusUnauthorized, ErrorBody{Code: "UNAUTHORIZED", Message: "invalid or missing access token"})
			return
		}
		ctx := auth.WithClaims(r.Context(), claims)
		if tok != "" {
			ctx = auth.WithUserToken(ctx, tok)
		}
		org, err := orgs.Resolve(ctx, claims)
		if err != nil {
			slog.WarnContext(ctx, "could not resolve organization", "error", err)
			writeJSON(w, http.StatusForbidden, ErrorBody{Code: "NO_ORGANIZATION", Message: err.Error()})
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithOrg(ctx, org)))
	})
}

func withCORS(origins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" && (slices.Contains(origins, o) || slices.Contains(origins, "*")) {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", o)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func withLogging(timeout time.Duration, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ctx := r.Context()
		if timeout > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, timeout)
			defer cancel()
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r.WithContext(ctx))
		slog.Debug("http", "method", r.Method, "path", r.URL.Path, "status", rec.status, "duration", time.Since(start))
	})
}
