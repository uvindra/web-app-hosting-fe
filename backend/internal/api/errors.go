package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/webapp"
)

// ErrorBody is the error response shape: {"code": "...", "message": "..."}.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Status maps an error to an HTTP status and error code (B8).
func Status(err error) (int, string) {
	if e, ok := webapp.AsError(err); ok {
		switch e.Code {
		case webapp.CodeBadRequest:
			return http.StatusBadRequest, string(e.Code)
		case webapp.CodeNotFound:
			return http.StatusNotFound, string(e.Code)
		case webapp.CodeConflict:
			return http.StatusConflict, string(e.Code)
		case webapp.CodeQuotaExceeded:
			return http.StatusPaymentRequired, string(e.Code)
		case webapp.CodeNotSupported:
			return http.StatusNotImplemented, string(e.Code)
		}
	}
	switch {
	case errors.Is(err, openchoreo.ErrPaymentRequired):
		return http.StatusPaymentRequired, string(webapp.CodeQuotaExceeded)
	case errors.Is(err, openchoreo.ErrNotFound):
		return http.StatusNotFound, "NOT_FOUND"
	case errors.Is(err, openchoreo.ErrConflict):
		return http.StatusConflict, "CONFLICT"
	case errors.Is(err, openchoreo.ErrBadRequest):
		return http.StatusBadRequest, "BAD_REQUEST"
	case errors.Is(err, openchoreo.ErrForbidden):
		return http.StatusForbidden, "FORBIDDEN"
	case errors.Is(err, openchoreo.ErrUnauthorized):
		return http.StatusUnauthorized, "UNAUTHORIZED"
	case errors.Is(err, platform.ErrRateLimited):
		return http.StatusTooManyRequests, "GIT_RATE_LIMITED"
	case errors.Is(err, platform.ErrGitHubAppUnavailable):
		return http.StatusNotImplemented, string(webapp.CodeNotSupported)
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout, "UPSTREAM_TIMEOUT"
	default:
		return http.StatusBadGateway, "UPSTREAM_ERROR"
	}
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	status, code := Status(err)
	msg := err.Error()
	var apiErr *openchoreo.APIError
	if errors.As(err, &apiErr) {
		msg = apiErr.Message
	}
	if code == string(webapp.CodeQuotaExceeded) && msg == "" {
		msg = "Quota reached — upgrade your plan to create more deployment tracks."
	}
	if status >= 500 {
		slog.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "status", status, "error", err)
	} else {
		slog.InfoContext(r.Context(), "request rejected", "method", r.Method, "path", r.URL.Path, "status", status, "error", err)
	}
	writeJSON(w, status, ErrorBody{Code: code, Message: msg})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func badRequest(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusBadRequest, ErrorBody{Code: "BAD_REQUEST", Message: msg})
}
