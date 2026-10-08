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

// Adapted from App Factory internal/clients/requests (see doc.go).

package openchoreo

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"slices"
	"time"
)

// Default retry configuration values.
const (
	// Worst case for one call: 3 attempts x 15s plus ~3s of backoff, inside
	// the 60s inbound REQUEST_TIMEOUT (previously 4 x 30s, past it).
	DefaultRetryWaitMin     = 500 * time.Millisecond
	DefaultRetryWaitMax     = 4 * time.Second
	DefaultRetryAttemptsMax = 2
	DefaultAttemptTimeout   = 15 * time.Second
)

// TransientHTTPErrorCodes are statuses worth retrying for non-idempotent
// operations (everything except GET/DELETE). 504 is not retried for those:
// the upstream may have applied the write, and a retry would then conflict.
var TransientHTTPErrorCodes = []int{
	http.StatusTooManyRequests,
	http.StatusBadGateway,
	http.StatusServiceUnavailable,
}

// TransientHTTPGETErrorCodes adds 500 for idempotent ops.
var TransientHTTPGETErrorCodes = []int{
	http.StatusTooManyRequests,
	http.StatusInternalServerError,
	http.StatusBadGateway,
	http.StatusServiceUnavailable,
	http.StatusGatewayTimeout,
}

// RequestRetryConfig drives retryableHTTPClient.
type RequestRetryConfig struct {
	RetryWaitMin     time.Duration
	RetryWaitMax     time.Duration
	RetryAttemptsMax int
	AttemptTimeout   time.Duration
	RetryOnStatus    func(method string, status int) bool
}

func (cfg RequestRetryConfig) withDefaults() RequestRetryConfig {
	if cfg.RetryWaitMin == 0 {
		cfg.RetryWaitMin = DefaultRetryWaitMin
	}
	if cfg.RetryWaitMax == 0 {
		cfg.RetryWaitMax = DefaultRetryWaitMax
	}
	if cfg.RetryAttemptsMax == 0 {
		cfg.RetryAttemptsMax = DefaultRetryAttemptsMax
	}
	if cfg.AttemptTimeout == 0 {
		cfg.AttemptTimeout = DefaultAttemptTimeout
	}
	if cfg.RetryOnStatus == nil {
		cfg.RetryOnStatus = defaultRetryOnStatus
	}
	return cfg
}

func defaultRetryOnStatus(method string, status int) bool {
	if method == http.MethodGet || method == http.MethodDelete {
		return slices.Contains(TransientHTTPGETErrorCodes, status)
	}
	return slices.Contains(TransientHTTPErrorCodes, status)
}

var errRetry = errors.New("retry")

type httpDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// retryableHTTPClient wraps an httpDoer with retry, jittered exponential
// backoff and per-attempt timeouts.
type retryableHTTPClient struct {
	client httpDoer
	config RequestRetryConfig
}

func newRetryableHTTPClient(client httpDoer, cfg RequestRetryConfig) *retryableHTTPClient {
	if client == nil {
		client = &http.Client{}
	}
	return &retryableHTTPClient{client: client, config: cfg.withDefaults()}
}

// Do executes req with retry. The body is buffered once so each retry sees a
// fresh reader.
func (c *retryableHTTPClient) Do(req *http.Request) (*http.Response, error) {
	ctx := req.Context()
	cfg := c.config
	log := slog.Default().With(slog.String("method", req.Method), slog.String("url", req.URL.String()))

	var bodyBytes []byte
	if req.Body != nil {
		var err error
		bodyBytes, err = io.ReadAll(req.Body)
		_ = req.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("failed to read request body: %w", err)
		}
	}

	for attempt := 1; attempt <= cfg.RetryAttemptsMax+1; attempt++ {
		isLast := attempt == cfg.RetryAttemptsMax+1
		if bodyBytes != nil {
			req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		}
		resp, err := c.doAttempt(ctx, req, cfg, attempt, isLast, log)
		if !errors.Is(err, errRetry) {
			return resp, err
		}
		if !isLast {
			select {
			case <-time.After(calculateBackoff(cfg.RetryWaitMin, cfg.RetryWaitMax, attempt)):
			case <-ctx.Done():
				return nil, fmt.Errorf("context cancelled during retry wait: %w", ctx.Err())
			}
		}
	}
	return nil, fmt.Errorf("unreachable: retry loop exited without returning")
}

func (c *retryableHTTPClient) doAttempt(ctx context.Context, req *http.Request, cfg RequestRetryConfig, attempt int, isLast bool, log *slog.Logger) (*http.Response, error) {
	attemptCtx, cancel := context.WithTimeout(ctx, cfg.AttemptTimeout)
	defer cancel()

	resp, err := c.client.Do(req.Clone(attemptCtx))
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("context cancelled or timed out: %w", ctx.Err())
		}
		if isLast {
			log.Warn("HTTP request failed after all attempts", "attempt", attempt, "error", err)
			return nil, fmt.Errorf("request failed after %d attempts: %w", attempt, err)
		}
		log.Debug("HTTP request failed, retrying", "attempt", attempt, "error", err)
		return nil, errRetry
	}

	if cfg.RetryOnStatus(req.Method, resp.StatusCode) && !isLast {
		log.Debug("HTTP request returned retryable status, retrying", "attempt", attempt, "status", resp.StatusCode)
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		return nil, errRetry
	}

	// Buffer the body before attemptCtx is cancelled so the caller can read it.
	body, readErr := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if readErr != nil {
		return nil, fmt.Errorf("failed to read response body: %w", readErr)
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return resp, nil
}

// calculateBackoff returns exponential backoff with equal jitter, capped at max.
func calculateBackoff(minWait, maxWait time.Duration, attempt int) time.Duration {
	base := minWait * time.Duration(1<<uint(attempt-1))
	if base > maxWait {
		base = maxWait
	}
	half := base / 2
	if half <= 0 {
		return base
	}
	return half + time.Duration(rand.Int64N(int64(half)))
}
