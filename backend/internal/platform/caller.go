package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

// caller makes authenticated JSON calls to platform side services: it
// forwards the user JWT on request-scoped calls and otherwise uses the BFF's
// M2M token (+ X-Impersonate-Org on WSO2 Cloud).
type caller struct {
	http        *http.Client
	tokens      openchoreo.TokenSource
	impersonate bool
	// forceService always uses the BFF identity (AUTH_MODE=dev).
	forceService bool
}

func newCaller(tokens openchoreo.TokenSource, impersonate, forceService bool) *caller {
	return &caller{http: &http.Client{Timeout: 30 * time.Second}, tokens: tokens, impersonate: impersonate, forceService: forceService}
}

func (c *caller) authorize(ctx context.Context, req *http.Request) error {
	if tok := auth.UserToken(ctx); tok != "" && !auth.IsServiceIdentity(ctx) && !c.forceService {
		req.Header.Set("Authorization", "Bearer "+tok)
		return nil
	}
	if c.tokens == nil {
		return fmt.Errorf("no service credentials configured")
	}
	tok, err := c.tokens.Token()
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	if c.impersonate {
		if o := auth.OrgFrom(ctx); o != nil && o.UUID != "" {
			req.Header.Set("X-Impersonate-Org", o.UUID)
		}
	}
	return nil
}

// do sends body (JSON-encoded unless nil) and decodes a 2xx JSON response into out.
func (c *caller) do(ctx context.Context, method, url string, body, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rdr)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if err := c.authorize(ctx, req); err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return openchoreo.NewAPIError(resp.StatusCode, raw)
	}
	if out == nil || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	return json.Unmarshal(raw, out)
}

// send executes a prepared request (no auth added) and decodes a JSON response.
func (c *caller) send(req *http.Request, out any) error {
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", req.Method, req.URL, err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return openchoreo.NewAPIError(resp.StatusCode, raw)
	}
	if out == nil || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	return json.Unmarshal(raw, out)
}
