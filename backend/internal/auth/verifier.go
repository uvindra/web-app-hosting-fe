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
// Adapted from App Factory internal/platform/auth/jwtassertion/auth.go
// (wso2/labs-agentic-engineer@d47fe99, Apache-2.0).

package auth

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// tokenClaims are the JWT claims the BFF reads.
type tokenClaims struct {
	Sub      string   `json:"sub"`
	ClientID string   `json:"client_id"`
	Username string   `json:"username"`
	OuID     string   `json:"ouId"`
	OuHandle string   `json:"ouHandle"`
	OuName   string   `json:"ouName"`
	Groups   []string `json:"groups"`
	jwt.RegisteredClaims
}

// Verifier validates bearer JWTs against a JWKS, issuer and (optionally)
// audience allow-lists.
type Verifier struct {
	JWKS      *JWKSCache
	Issuers   []string
	Audiences []string // empty = audience not checked
}

// Verify parses and validates token and returns its claims.
func (v *Verifier) Verify(token string) (*Claims, error) {
	if v == nil || v.JWKS == nil {
		return nil, errors.New("JWKS not configured")
	}
	parsed, err := jwt.ParseWithClaims(token, &tokenClaims{}, func(t *jwt.Token) (any, error) {
		switch t.Method.(type) {
		case *jwt.SigningMethodRSA, *jwt.SigningMethodECDSA, *jwt.SigningMethodRSAPSS:
		default:
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("kid not found in token header")
		}
		return v.JWKS.KeyForKid(kid)
	}, jwt.WithExpirationRequired())
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}
	tc, ok := parsed.Claims.(*tokenClaims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	if !slices.Contains(v.Issuers, strings.TrimSpace(tc.Issuer)) {
		return nil, fmt.Errorf("invalid issuer %q", tc.Issuer)
	}
	if len(v.Audiences) > 0 && !slices.ContainsFunc(tc.Audience, func(a string) bool { return slices.Contains(v.Audiences, a) }) {
		return nil, fmt.Errorf("invalid audience %v", tc.Audience)
	}
	return &Claims{
		Subject: tc.Sub, ClientID: tc.ClientID, Username: tc.Username,
		OuID: tc.OuID, OuHandle: tc.OuHandle, OuName: tc.OuName, Groups: tc.Groups,
	}, nil
}
