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
// Adapted from App Factory internal/platform/auth/jwtassertion/jwks_cache.go
// (wso2/labs-agentic-engineer@d47fe99, Apache-2.0): adds EC (P-256/384/521)
// keys, which ThunderID also publishes.

package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"regexp"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

type jwks struct {
	Keys []jsonWebKey `json:"keys"`
}

type jsonWebKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

var validKidPattern = regexp.MustCompile(`^[a-zA-Z0-9._:=+/~-]{1,256}$`)

const (
	jwksCacheTTL       = time.Hour
	minRefreshInterval = 30 * time.Second
)

// JWKSCache caches one JWKS source and refreshes on an unknown kid
// (rate-limited), so signing-key rotation is picked up without a restart.
type JWKSCache struct {
	url        string
	httpClient *http.Client

	mu            sync.RWMutex
	keys          *jwks
	fetchedAt     time.Time
	lastRefreshAt time.Time
	group         singleflight.Group
}

// NewJWKSCache returns a cache for the JWKS at url.
func NewJWKSCache(url string) *JWKSCache {
	return &JWKSCache{url: url, httpClient: &http.Client{Timeout: 10 * time.Second}}
}

// KeyForKid returns the public key (RSA or EC) with the given kid.
func (c *JWKSCache) KeyForKid(kid string) (any, error) {
	set, err := c.fetch(false)
	if err != nil {
		return nil, err
	}
	if k := findKey(set, kid); k != nil {
		return k.publicKey()
	}
	if !validKidPattern.MatchString(kid) {
		return nil, fmt.Errorf("unknown kid (invalid format)")
	}
	slog.Warn("kid not found in JWKS, refreshing", "kid", kid)
	set, err = c.fetch(true)
	if err != nil {
		return nil, err
	}
	if k := findKey(set, kid); k != nil {
		return k.publicKey()
	}
	return nil, fmt.Errorf("unknown kid after JWKS refresh")
}

func (c *JWKSCache) fetch(force bool) (*jwks, error) {
	c.mu.RLock()
	cached, fetchedAt, lastRefresh := c.keys, c.fetchedAt, c.lastRefreshAt
	c.mu.RUnlock()
	if cached != nil && !force && time.Since(fetchedAt) < jwksCacheTTL {
		return cached, nil
	}
	if cached != nil && force && !lastRefresh.IsZero() && time.Since(lastRefresh) < minRefreshInterval {
		return cached, nil
	}
	v, err, _ := c.group.Do("fetch", func() (any, error) {
		set, err := c.doFetch()
		now := time.Now()
		c.mu.Lock()
		defer c.mu.Unlock()
		if force {
			c.lastRefreshAt = now
		}
		if err != nil {
			return nil, err
		}
		c.keys, c.fetchedAt = set, now
		return set, nil
	})
	if err != nil {
		return nil, err
	}
	return v.(*jwks), nil
}

func (c *JWKSCache) doFetch() (*jwks, error) {
	resp, err := c.httpClient.Get(c.url)
	if err != nil {
		return nil, fmt.Errorf("fetch JWKS: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS endpoint returned status %d", resp.StatusCode)
	}
	var set jwks
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, fmt.Errorf("decode JWKS: %w", err)
	}
	return &set, nil
}

func findKey(set *jwks, kid string) *jsonWebKey {
	for i := range set.Keys {
		if set.Keys[i].Kid == kid {
			return &set.Keys[i]
		}
	}
	return nil
}

func b64Int(s string) (*big.Int, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(b), nil
}

func (k *jsonWebKey) publicKey() (any, error) {
	switch k.Kty {
	case "RSA":
		n, err := b64Int(k.N)
		if err != nil {
			return nil, fmt.Errorf("decode modulus: %w", err)
		}
		e, err := b64Int(k.E)
		if err != nil {
			return nil, fmt.Errorf("decode exponent: %w", err)
		}
		return &rsa.PublicKey{N: n, E: int(e.Int64())}, nil
	case "EC":
		var curve elliptic.Curve
		switch k.Crv {
		case "P-256":
			curve = elliptic.P256()
		case "P-384":
			curve = elliptic.P384()
		case "P-521":
			curve = elliptic.P521()
		default:
			return nil, fmt.Errorf("unsupported EC curve %q", k.Crv)
		}
		x, err := b64Int(k.X)
		if err != nil {
			return nil, fmt.Errorf("decode x: %w", err)
		}
		y, err := b64Int(k.Y)
		if err != nil {
			return nil, fmt.Errorf("decode y: %w", err)
		}
		return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
	default:
		return nil, fmt.Errorf("unsupported key type %q", k.Kty)
	}
}
