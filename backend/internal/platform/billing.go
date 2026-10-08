package platform

import (
	"context"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/auth"
	"github.com/wso2/web-app-hosting/backend/internal/openchoreo"
)

// Plan types.
const (
	PlanFree = "free"
	PlanPaid = "paid"
)

// PlanInfo is an org's Web App Hosting subscription.
type PlanInfo struct {
	// Type is PlanFree or PlanPaid: what gated features follow.
	Type string
	// Name is the plan's display name ("Free", "Pay As You Go").
	Name string
	// Status is the subscription status (active, trial, past_due, ...).
	Status string
	// TrialDaysRemaining is set while the subscription is on trial.
	TrialDaysRemaining *int
}

// Billing reads the caller org's plan.
type Billing interface {
	Plan(ctx context.Context) (*PlanInfo, error)
}

// StaticBilling (TARGET=openchoreo) has no billing service: every org is on
// the configured plan (LOCAL_PLAN), so both gating paths can be tried locally.
type StaticBilling struct{ Type string }

// Plan implements Billing.
func (b StaticBilling) Plan(context.Context) (*PlanInfo, error) {
	name := "Paid (local)"
	if b.Type == PlanFree {
		name = "Free (local)"
	}
	return &PlanInfo{Type: b.Type, Name: name, Status: "active"}, nil
}

// CloudBilling (TARGET=wso2cloud) reads the billing user API
// `GET {base}/organization?product=web-app-hosting` with the caller's JWT
// (which also activates the product's default plan on first login). Results
// are cached per org for TTL.
type CloudBilling struct {
	BaseURL string
	Product string
	// FreePlanCodes are the plan codes that count as free (the billing API
	// exposes the plan's code, not its type).
	FreePlanCodes []string
	TTL           time.Duration
	call          *caller

	mu    sync.Mutex
	cache map[string]cachedPlan
}

type cachedPlan struct {
	plan *PlanInfo
	at   time.Time
}

// NewCloudBilling builds a CloudBilling.
func NewCloudBilling(baseURL, product string, freePlanCodes []string, tokens openchoreo.TokenSource) *CloudBilling {
	return &CloudBilling{BaseURL: baseURL, Product: product, FreePlanCodes: freePlanCodes, TTL: time.Minute, call: newCaller(tokens, true, false), cache: map[string]cachedPlan{}}
}

type billingOrg struct {
	Subscription *struct {
		Status string `json:"status"`
		Plan   *struct {
			Code string `json:"code"`
			Name string `json:"name"`
		} `json:"plan"`
		Trial *struct {
			DaysRemaining int `json:"days_remaining"`
		} `json:"trial"`
	} `json:"subscription"`
}

// Plan implements Billing.
func (b *CloudBilling) Plan(ctx context.Context) (*PlanInfo, error) {
	key := ""
	if o := auth.OrgFrom(ctx); o != nil {
		key = o.UUID + "/" + o.Namespace
	}
	b.mu.Lock()
	if c, ok := b.cache[key]; ok && time.Since(c.at) < b.TTL {
		b.mu.Unlock()
		return c.plan, nil
	}
	b.mu.Unlock()
	var org billingOrg
	if err := b.call.do(ctx, http.MethodGet, b.BaseURL+"/organization?"+url.Values{"product": {b.Product}}.Encode(), nil, &org); err != nil {
		return nil, err
	}
	p := planFromSubscription(org, b.FreePlanCodes)
	b.mu.Lock()
	b.cache[key] = cachedPlan{plan: p, at: time.Now()}
	b.mu.Unlock()
	return p, nil
}

// liveSubscriptionStatuses are the billing service's subscription statuses
// that keep a product usable — the same set as its lifecycle service's
// isLive (wso2cloud backend/billing internal/service/lifecycle): active,
// trial, past_due (payment failed, still in the grace period) and
// pending_cancellation (cancelled at period end, paid until then). The other
// values (inactive, pending_activation, suspended, cancelled) are not.
var liveSubscriptionStatuses = map[string]bool{"active": true, "trial": true, "past_due": true, "pending_cancellation": true}

// planFromSubscription maps a billing org to a plan: paid while a live
// subscription (liveSubscriptionStatuses) is on a plan whose code is not a
// free plan's; anything else (no subscription, inactive, suspended,
// cancelled) gates like the free plan.
func planFromSubscription(org billingOrg, freeCodes []string) *PlanInfo {
	p := &PlanInfo{Type: PlanFree, Name: "Free"}
	sub := org.Subscription
	if sub == nil {
		return p
	}
	p.Status = sub.Status
	if sub.Trial != nil && sub.Status == "trial" {
		d := sub.Trial.DaysRemaining
		p.TrialDaysRemaining = &d
	}
	if sub.Plan == nil {
		return p
	}
	if sub.Plan.Name != "" {
		p.Name = sub.Plan.Name
	}
	free := false
	for _, c := range freeCodes {
		free = free || c == sub.Plan.Code
	}
	if !free && liveSubscriptionStatuses[sub.Status] {
		p.Type = PlanPaid
	}
	return p
}
