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
// Adapted from App Factory internal/clients/oauth/token_provider.go
// (wso2/labs-agentic-engineer@d47fe99, Apache-2.0).

// Package oauth fetches and caches OAuth2 client_credentials tokens for the
// BFF's own (M2M) identity.
package oauth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// TokenProvider fetches and caches client_credentials tokens.
type TokenProvider struct {
	tokenURL     string
	clientID     string
	clientSecret string
	scope        string
	httpClient   *http.Client

	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

// NewTokenProvider builds a provider for the given token endpoint and client.
func NewTokenProvider(tokenURL, clientID, clientSecret, scope string) *TokenProvider {
	return &TokenProvider{
		tokenURL: tokenURL, clientID: clientID, clientSecret: clientSecret, scope: scope,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// Token returns a valid access token, refreshing when it is within 60s of expiry.
func (p *TokenProvider) Token() (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.token != "" && time.Now().Add(60*time.Second).Before(p.expiresAt) {
		return p.token, nil
	}
	return p.fetchLocked()
}

// Invalidate drops the cached token (call on a downstream 401).
func (p *TokenProvider) Invalidate() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.token, p.expiresAt = "", time.Time{}
}

func (p *TokenProvider) fetchLocked() (string, error) {
	data := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {p.clientID},
		"client_secret": {p.clientSecret},
	}
	if p.scope != "" {
		data.Set("scope", p.scope)
	}
	req, err := http.NewRequest(http.MethodPost, p.tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("create token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", fmt.Errorf("parse token response: %w", err)
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("token endpoint returned no access_token")
	}
	p.token = tr.AccessToken
	p.expiresAt = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	return p.token, nil
}
