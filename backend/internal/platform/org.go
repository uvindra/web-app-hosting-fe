package platform

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

// StaticOrgResolver (TARGET=openchoreo) maps every caller to one configured
// namespace. The org handle comes from the JWT when present, else from config.
type StaticOrgResolver struct {
	Namespace string
	Handle    string
}

// Resolve implements OrgResolver.
func (s StaticOrgResolver) Resolve(_ context.Context, c *auth.Claims) (*auth.Org, error) {
	o := &auth.Org{Handle: s.Handle, Namespace: s.Namespace}
	if c != nil {
		o.UUID = c.OuID
		if c.OuHandle != "" {
			o.Handle = c.OuHandle
		}
	}
	return o, nil
}

// CloudOrgResolver (TARGET=wso2cloud) takes the org from the JWT (`ouId`,
// `ouHandle`) and its OC namespace (`wc-<org8>-<hash8>`) from PAS's
// org-scoped `GET /wso2cloud-dp/api/v1/namespaces`, cached per org.
type CloudOrgResolver struct {
	OC *openchoreo.Client

	mu    sync.RWMutex
	cache map[string]string
}

// Resolve implements OrgResolver.
func (r *CloudOrgResolver) Resolve(ctx context.Context, c *auth.Claims) (*auth.Org, error) {
	if c == nil || c.OuID == "" {
		return nil, errors.New("token has no organization (ouId) claim")
	}
	o := &auth.Org{UUID: c.OuID, Handle: c.OuHandle}
	if o.Handle == "" {
		o.Handle = c.OuName
	}
	r.mu.RLock()
	ns, ok := r.cache[c.OuID]
	r.mu.RUnlock()
	if ok {
		o.Namespace = ns
		return o, nil
	}
	items, err := r.OC.ListNamespaces(auth.WithOrg(ctx, o))
	if err != nil {
		return nil, fmt.Errorf("resolve org namespace: %w", err)
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("no OpenChoreo namespace for organization %s", c.OuID)
	}
	o.Namespace = items[0].Metadata.Name
	r.mu.Lock()
	if r.cache == nil {
		r.cache = map[string]string{}
	}
	r.cache[c.OuID] = o.Namespace
	r.mu.Unlock()
	return o, nil
}
