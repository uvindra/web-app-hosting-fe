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

// Package openchoreo is the Web App Hosting BFF's client for the OpenChoreo
// API — either directly (TARGET=openchoreo, local k3d) or through the WSO2
// Cloud platform-api-service proxy (TARGET=wso2cloud, /wso2cloud-dp/...).
// Both expose the same OC-shaped /api/v1/namespaces/{ns}/... surface.
//
// Provenance: the transport, retry, error, label-stamping, stale-write and
// ComponentType-ensure code is copied from App Factory's OpenChoreo client
// layer (OSS wso2/labs-agentic-engineer, services/aep-api/internal/clients/
// openchoreo at d47fe9975ca008becbb3351c568b5582fcc1b64b, Apache-2.0), with
// App Factory-specific code stripped. gen/ is that repo's oapi-codegen v2.7.0
// output for the OpenChoreo v1.2.5 spec (the version WSO2 Cloud runs); only
// fields present in both v1.2.5 and v1.3.0 are relied on.
package openchoreo
