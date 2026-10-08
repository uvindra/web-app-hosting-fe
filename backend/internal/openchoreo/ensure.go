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
// Adapted from App Factory internal/clients/openchoreo/component_type_ensure.go
// (see doc.go): here the convergence gate is an explicit version annotation
// (D9) rather than a spec-containment diff, and it covers namespaced
// Workflows as well as ComponentTypes.

package openchoreo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// VersionAnnotation carries the BFF-shipped version of a platform resource.
const VersionAnnotation = "web-app-hosting.wso2.com/ct-version"

// EnsureKind is a namespaced platform resource kind the BFF upserts.
type EnsureKind string

const (
	KindComponentType EnsureKind = "ComponentType"
	KindWorkflow      EnsureKind = "Workflow"
	KindTrait         EnsureKind = "Trait"
)

// EnsureVersioned creates the namespaced ComponentType / Workflow / Trait when absent
// and replaces it when the stored version annotation is lower than the
// shipped one. Equal or higher stored versions are left untouched (a newer
// BFF may already have rolled forward). Idempotent.
func (c *Client) EnsureVersioned(ctx context.Context, ns string, kind EnsureKind, body map[string]any) error {
	meta, _ := body["metadata"].(map[string]any)
	name, _ := meta["name"].(string)
	if name == "" {
		return fmt.Errorf("ensure %s: metadata.name is required", kind)
	}
	want := versionOf(meta)
	raw, err := json.Marshal(c.labels.stampedObject(body))
	if err != nil {
		return fmt.Errorf("ensure %s %q: marshal: %w", kind, name, err)
	}

	var status int
	var respBody []byte
	switch kind {
	case KindComponentType:
		r, err := c.oc.CreateComponentTypeWithBodyWithResponse(ctx, ns, "application/json", bytes.NewReader(raw))
		if err != nil {
			return fmt.Errorf("ensure %s %q: %w", kind, name, err)
		}
		status, respBody = r.StatusCode(), r.Body
	case KindWorkflow:
		r, err := c.oc.CreateWorkflowWithBodyWithResponse(ctx, ns, "application/json", bytes.NewReader(raw))
		if err != nil {
			return fmt.Errorf("ensure %s %q: %w", kind, name, err)
		}
		status, respBody = r.StatusCode(), r.Body
	case KindTrait:
		r, err := c.oc.CreateTraitWithBodyWithResponse(ctx, ns, "application/json", bytes.NewReader(raw))
		if err != nil {
			return fmt.Errorf("ensure %s %q: %w", kind, name, err)
		}
		status, respBody = r.StatusCode(), r.Body
	default:
		return fmt.Errorf("ensure: unsupported kind %q", kind)
	}
	switch {
	case status == http.StatusCreated || status == http.StatusOK:
		slog.InfoContext(ctx, "openchoreo: created platform resource", "kind", kind, "name", name, "namespace", ns, "version", want)
		return nil
	case status != http.StatusConflict:
		return fmt.Errorf("ensure %s %q: %w", kind, name, respError(status, respBody))
	}

	return retryStaleWrite(ctx, string(kind)+"/"+name, func(ctx context.Context) error {
		have, err := c.storedVersion(ctx, ns, kind, name)
		if err != nil {
			return err
		}
		if have >= want {
			return nil
		}
		slog.InfoContext(ctx, "openchoreo: upgrading platform resource", "kind", kind, "name", name, "namespace", ns, "from", have, "to", want)
		var st int
		var b []byte
		switch kind {
		case KindComponentType:
			r, err := c.oc.UpdateComponentTypeWithBodyWithResponse(ctx, ns, gen.ComponentTypeNameParam(name), "application/json", bytes.NewReader(raw))
			if err != nil {
				return err
			}
			st, b = r.StatusCode(), r.Body
		case KindWorkflow:
			r, err := c.oc.UpdateWorkflowWithBodyWithResponse(ctx, ns, gen.WorkflowNameParam(name), "application/json", bytes.NewReader(raw))
			if err != nil {
				return err
			}
			st, b = r.StatusCode(), r.Body
		case KindTrait:
			r, err := c.oc.UpdateTraitWithBodyWithResponse(ctx, ns, gen.TraitNameParam(name), "application/json", bytes.NewReader(raw))
			if err != nil {
				return err
			}
			st, b = r.StatusCode(), r.Body
		}
		if st == http.StatusOK || st == http.StatusCreated {
			return nil
		}
		return respError(st, b)
	})
}

func (c *Client) storedVersion(ctx context.Context, ns string, kind EnsureKind, name string) (int, error) {
	var meta gen.ObjectMeta
	switch kind {
	case KindComponentType:
		r, err := c.oc.GetComponentTypeWithResponse(ctx, ns, gen.ComponentTypeNameParam(name))
		if err != nil {
			return 0, err
		}
		if r.JSON200 == nil {
			return 0, respError(r.StatusCode(), r.Body)
		}
		meta = r.JSON200.Metadata
	case KindWorkflow:
		r, err := c.oc.GetWorkflowWithResponse(ctx, ns, gen.WorkflowNameParam(name))
		if err != nil {
			return 0, err
		}
		if r.JSON200 == nil {
			return 0, respError(r.StatusCode(), r.Body)
		}
		meta = r.JSON200.Metadata
	case KindTrait:
		r, err := c.oc.GetTraitWithResponse(ctx, ns, gen.TraitNameParam(name))
		if err != nil {
			return 0, err
		}
		if r.JSON200 == nil {
			return 0, respError(r.StatusCode(), r.Body)
		}
		meta = r.JSON200.Metadata
	}
	if meta.Annotations == nil {
		return 0, nil
	}
	v, _ := strconv.Atoi((*meta.Annotations)[VersionAnnotation])
	return v, nil
}

func versionOf(meta map[string]any) int {
	ann, _ := meta["annotations"].(map[string]any)
	s, _ := ann[VersionAnnotation].(string)
	v, _ := strconv.Atoi(s)
	return v
}
