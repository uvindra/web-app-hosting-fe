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
// Adapted from App Factory internal/clients/openchoreo/errors.go (see doc.go).

package openchoreo

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// Sentinel errors for OpenChoreo / platform HTTP semantics. Callers branch on
// these with errors.Is; the human message stays in err.Error().
var (
	ErrBadRequest          = errors.New("bad request")
	ErrUnauthorized        = errors.New("unauthorized")
	ErrForbidden           = errors.New("forbidden")
	ErrNotFound            = errors.New("not found")
	ErrConflict            = errors.New("conflict")
	ErrPaymentRequired     = errors.New("payment required") // PAS entitlement gate (quota)
	ErrInternalServerError = errors.New("internal server error")
	ErrUpstream            = errors.New("upstream error")
)

// APIError is an error response from OpenChoreo or the platform API.
type APIError struct {
	Status  int
	Message string
	kind    error
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s (HTTP %d): %s", e.kind, e.Status, e.Message)
}

// Unwrap lets errors.Is match the sentinel.
func (e *APIError) Unwrap() error { return e.kind }

// respError builds an *APIError for a non-2xx response.
func respError(status int, body []byte) error {
	kind := sentinelForStatus(status)
	if kind == nil {
		kind = ErrUpstream
	}
	return &APIError{Status: status, Message: humanErrorMessage(body, http.StatusText(status)), kind: kind}
}

// humanErrorMessage extracts a human sentence from an OC / platform error body.
func humanErrorMessage(body []byte, fallback string) string {
	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		return fallback
	}
	var envelope struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &envelope) == nil {
		if m := strings.TrimSpace(envelope.Error); m != "" {
			return m
		}
		if m := strings.TrimSpace(envelope.Message); m != "" {
			return m
		}
	}
	s := string(body)
	if len(s) > 300 {
		s = s[:300]
	}
	return s
}

func sentinelForStatus(status int) error {
	switch status {
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return ErrBadRequest
	case http.StatusUnauthorized:
		return ErrUnauthorized
	case http.StatusPaymentRequired:
		return ErrPaymentRequired
	case http.StatusForbidden:
		return ErrForbidden
	case http.StatusNotFound:
		return ErrNotFound
	case http.StatusConflict:
		return ErrConflict
	case http.StatusInternalServerError:
		return ErrInternalServerError
	default:
		return nil
	}
}

// NewAPIError builds an *APIError from a non-2xx response of any platform
// service, so callers branch on the same sentinels everywhere.
func NewAPIError(status int, body []byte) error { return respError(status, body) }
