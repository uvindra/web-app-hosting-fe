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
// Package auth holds the BFF's inbound identity: JWT verification against
// the Platform IdP JWKS and the request-context carriers the outbound
// clients read (user JWT to forward, service-identity marker, org).
package auth

import "context"

// Claims is the BFF-internal projection of the verified inbound JWT.
type Claims struct {
	Subject  string
	ClientID string
	Username string
	// Organisation claims (WSO2 Cloud Platform IdP / ThunderID).
	OuID     string
	OuHandle string
	OuName   string
	Groups   []string
}

type (
	claimsKey          struct{}
	userTokenKey       struct{}
	serviceIdentityKey struct{}
)

// WithClaims returns ctx carrying the verified claims.
func WithClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, c)
}

// ClaimsFrom returns the verified claims, or nil.
func ClaimsFrom(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey{}).(*Claims)
	return c
}

// WithUserToken stores the inbound end-user bearer token, to be forwarded on
// request-scoped platform calls.
func WithUserToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, userTokenKey{}, token)
}

// UserToken returns the inbound end-user bearer token, or "".
func UserToken(ctx context.Context) string {
	t, _ := ctx.Value(userTokenKey{}).(string)
	return t
}

// WithServiceIdentity marks ctx as a background call that must use the
// BFF's own M2M identity (and impersonate the org on WSO2 Cloud), even when a
// user token is present.
func WithServiceIdentity(ctx context.Context) context.Context {
	return context.WithValue(ctx, serviceIdentityKey{}, true)
}

// IsServiceIdentity reports whether ctx was marked by WithServiceIdentity.
func IsServiceIdentity(ctx context.Context) bool {
	v, _ := ctx.Value(serviceIdentityKey{}).(bool)
	return v
}

// Detached returns a background context that keeps ctx's identity values
// (claims, org) but not its cancellation, and is marked as service identity.
// Used for work that outlives the request (post-build deploys).
func Detached(ctx context.Context) context.Context {
	out := WithServiceIdentity(context.Background())
	if c := ClaimsFrom(ctx); c != nil {
		out = WithClaims(out, c)
	}
	if o := OrgFrom(ctx); o != nil {
		out = WithOrg(out, o)
	}
	return out
}
