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
package auth

import "context"

// Org is the organization a request acts in.
type Org struct {
	// UUID is the WSO2 Cloud org UUID (JWT ouId). Empty on plain OpenChoreo.
	UUID string
	// Handle is the org handle (JWT ouHandle, or the configured local org).
	Handle string
	// Namespace is the OpenChoreo namespace that holds the org's resources.
	Namespace string
}

type orgKey struct{}

// WithOrg returns ctx carrying the resolved org.
func WithOrg(ctx context.Context, o *Org) context.Context {
	return context.WithValue(ctx, orgKey{}, o)
}

// OrgFrom returns the resolved org, or nil.
func OrgFrom(ctx context.Context) *Org {
	o, _ := ctx.Value(orgKey{}).(*Org)
	return o
}
