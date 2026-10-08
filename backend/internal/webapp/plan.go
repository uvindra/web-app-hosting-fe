package webapp

import (
	"context"
	"fmt"
	"slices"

	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// Free-plan limits (the gated features of P1; paid plans have none of them).
const (
	freeMaxReplicas     = 1
	freeMaxEnvironments = 1
)

// PlanLimits are the features the org's plan allows.
type PlanLimits struct {
	Autoscaling bool `json:"autoscaling"`
	// MaxReplicas caps fixed replicas.
	MaxReplicas int `json:"maxReplicas"`
	// CustomResources allows container resources above the defaults.
	CustomResources bool `json:"customResources"`
	// MaxEnvironments is how many pipeline environments (in promotion order)
	// can be deployed to; 0 = all.
	MaxEnvironments int `json:"maxEnvironments"`
}

// Plan is the org's Web App Hosting plan as the console shows it.
type Plan struct {
	Type               string     `json:"type"` // free | paid
	Name               string     `json:"name"`
	Status             string     `json:"status,omitempty"`
	TrialDaysRemaining *int       `json:"trialDaysRemaining,omitempty"`
	Limits             PlanLimits `json:"limits"`
}

func limitsFor(planType string) PlanLimits {
	if planType == platform.PlanPaid {
		return PlanLimits{Autoscaling: true, MaxReplicas: maxReplicas, CustomResources: true}
	}
	return PlanLimits{MaxReplicas: freeMaxReplicas, MaxEnvironments: freeMaxEnvironments}
}

// Plan returns the caller org's plan.
func (s *Service) Plan(ctx context.Context) (*Plan, error) {
	p, err := s.plan(ctx)
	if err != nil {
		return nil, err
	}
	return &Plan{Type: p.Type, Name: p.Name, Status: p.Status, TrialDaysRemaining: p.TrialDaysRemaining, Limits: limitsFor(p.Type)}, nil
}

func (s *Service) plan(ctx context.Context) (*platform.PlanInfo, error) {
	if s.p.Billing == nil {
		return &platform.PlanInfo{Type: platform.PlanPaid, Name: "Paid"}, nil
	}
	p, err := s.p.Billing.Plan(ctx)
	if err != nil {
		return nil, fmt.Errorf("read the org's plan: %w", err)
	}
	return p, nil
}

// limits returns the caller org's plan limits (for gating writes).
func (s *Service) limits(ctx context.Context) (PlanLimits, error) {
	p, err := s.plan(ctx)
	if err != nil {
		return PlanLimits{}, err
	}
	return limitsFor(p.Type), nil
}

func planRequired(format string, a ...any) error {
	return errf(CodePlanRequired, format+" Upgrade your plan to use it.", a...)
}

// checkEnvironmentAllowed rejects deploys to environments past the plan's
// environment count (in promotion order).
func (s *Service) checkEnvironmentAllowed(ctx context.Context, project, env string) error {
	envs, err := s.pipelineEnvironments(ctx, project)
	if err != nil {
		return err
	}
	idx := slices.IndexFunc(envs, func(e Environment) bool { return e.ID == env })
	if idx < freeMaxEnvironments { // allowed on every plan: no billing call
		return nil
	}
	l, err := s.limits(ctx)
	if err != nil {
		return err
	}
	if l.MaxEnvironments > 0 && idx >= l.MaxEnvironments {
		return planRequired("Deploying to %s is not included in your plan (it allows %d environment).", envs[idx].Name, l.MaxEnvironments)
	}
	return nil
}
