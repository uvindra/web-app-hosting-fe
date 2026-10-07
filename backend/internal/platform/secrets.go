package platform

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// OCSecretStore (TARGET=openchoreo) stores secrets through the OpenChoreo
// Secret API (`/api/v1alpha1/namespaces/{ns}/secrets`), which writes the
// value to the secret backend (OpenBao) and creates a same-named
// SecretReference.
type OCSecretStore struct {
	OC        *openchoreo.Client
	PlaneKind string
	PlaneName string
}

// Put implements SecretStore.
func (s *OCSecretStore) Put(ctx context.Context, name, existingRef string, keys []string, data map[string]string) (string, error) {
	for _, k := range keys {
		if _, ok := data[k]; !ok {
			return "", fmt.Errorf("value for %q is required", k)
		}
	}
	ns := nsOf(ctx)
	if existingRef != "" {
		if err := s.OC.UpdateSecret(ctx, ns, existingRef, data); err == nil {
			return existingRef, nil
		} else if !errors.Is(err, openchoreo.ErrNotFound) {
			return "", err
		}
	}
	err := s.OC.CreateSecret(ctx, ns, gen.CreateSecretRequest{
		SecretName:  name,
		SecretType:  gen.SecretType("Opaque"),
		TargetPlane: gen.TargetPlaneRef{Kind: gen.TargetPlaneRefKind(s.PlaneKind), Name: s.PlaneName},
		Data:        data,
	})
	if errors.Is(err, openchoreo.ErrConflict) {
		return name, s.OC.UpdateSecret(ctx, ns, name, data)
	}
	return name, err
}

// Delete implements SecretStore.
func (s *OCSecretStore) Delete(ctx context.Context, ref string) error {
	return s.OC.DeleteSecret(ctx, nsOf(ctx), ref)
}

func nsOf(ctx context.Context) string {
	if o := auth.OrgFrom(ctx); o != nil {
		return o.Namespace
	}
	return ""
}

// SecretManagerStore (TARGET=wso2cloud) uses secret-manager-api (separate
// host; user JWT, or M2M + X-Impersonate-Org). The namespace is derived
// server-side from the caller's org.
type SecretManagerStore struct {
	BaseURL string
	call    *caller
}

// NewSecretManagerStore builds a SecretManagerStore.
func NewSecretManagerStore(baseURL string, tokens openchoreo.TokenSource) *SecretManagerStore {
	return &SecretManagerStore{BaseURL: baseURL, call: newCaller(tokens, true, false)}
}

type smSecret struct {
	Metadata struct {
		ID string `json:"id"`
	} `json:"metadata"`
	Spec struct {
		Keys                []string `json:"keys"`
		SecretReferenceName string   `json:"secretReferenceName"`
	} `json:"spec"`
}

// Put implements SecretStore. existingRef is the secret-manager secret id.
// The returned value is "<id>|<secretReferenceName>".
func (s *SecretManagerStore) Put(ctx context.Context, name, existingRef string, keys []string, data map[string]string) (string, error) {
	if id, _ := splitRef(existingRef); id != "" {
		// Replace the key set: drop keys that are gone, set the rest.
		var cur smSecret
		if err := s.call.do(ctx, http.MethodGet, s.BaseURL+"/secrets/"+url.PathEscape(id), nil, &cur); err == nil {
			patch := map[string]*string{}
			for _, k := range cur.Spec.Keys {
				if !slices.Contains(keys, k) {
					patch[k] = nil
				}
			}
			for k, v := range data {
				v := v
				patch[k] = &v
			}
			var out smSecret
			if err := s.call.do(ctx, http.MethodPatch, s.BaseURL+"/secrets/"+url.PathEscape(id), map[string]any{"spec": map[string]any{"data": patch}}, &out); err != nil {
				return "", err
			}
			return joinRef(id, cur.Spec.SecretReferenceName), nil
		} else if !errors.Is(err, openchoreo.ErrNotFound) {
			return "", err
		}
	}
	var out smSecret
	body := map[string]any{
		"metadata": map[string]any{"name": name, "labels": map[string]string{"cloud.wso2.com/product-name": "web-app-hosting"}},
		"spec":     map[string]any{"data": data},
	}
	if err := s.call.do(ctx, http.MethodPost, s.BaseURL+"/secrets", body, &out); err != nil {
		return "", err
	}
	return joinRef(out.Metadata.ID, out.Spec.SecretReferenceName), nil
}

// Delete implements SecretStore.
func (s *SecretManagerStore) Delete(ctx context.Context, ref string) error {
	id, _ := splitRef(ref)
	if id == "" {
		return nil
	}
	err := s.call.do(ctx, http.MethodDelete, s.BaseURL+"/secrets/"+url.PathEscape(id), nil, nil)
	if errors.Is(err, openchoreo.ErrNotFound) {
		return nil
	}
	return err
}

func joinRef(id, refName string) string { return fmt.Sprintf("%s|%s", id, refName) }

func splitRef(ref string) (id, refName string) {
	for i := 0; i < len(ref); i++ {
		if ref[i] == '|' {
			return ref[:i], ref[i+1:]
		}
	}
	return ref, ref
}

// SecretReferenceName returns the SecretReference name encoded in a stored ref.
func SecretReferenceName(ref string) string {
	_, n := splitRef(ref)
	return n
}
