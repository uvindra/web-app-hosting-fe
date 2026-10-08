package webapp

import (
	"context"
	"slices"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platformres"
)

// CT environmentConfigs defaults (platformres componenttype.yaml.tmpl).
const (
	defaultCPURequest = "100m"
	defaultCPULimit   = "100m"
	defaultMemRequest = "350Mi"
	defaultMemLimit   = "1Gi"
	defaultPull       = "IfNotPresent"
	minReplicas       = 1
	maxReplicas       = 5
)

// envConfigs is the binding's componentTypeEnvironmentConfigs view.
type envConfigs struct {
	Replicas                                   int
	CPURequest, CPULimit, MemRequest, MemLimit string
	PullPolicy                                 string
}

func readEnvConfigs(spec *gen.ReleaseBindingSpec) envConfigs {
	c := envConfigs{Replicas: 1, CPURequest: defaultCPURequest, CPULimit: defaultCPULimit, MemRequest: defaultMemRequest, MemLimit: defaultMemLimit, PullPolicy: defaultPull}
	if spec == nil || spec.ComponentTypeEnvironmentConfigs == nil {
		return c
	}
	m := *spec.ComponentTypeEnvironmentConfigs
	if r, ok := m["replicas"].(float64); ok {
		c.Replicas = int(r)
	}
	if p, ok := m["imagePullPolicy"].(string); ok && p != "" {
		c.PullPolicy = p
	}
	res, _ := m["resources"].(map[string]any)
	req, _ := res["requests"].(map[string]any)
	lim, _ := res["limits"].(map[string]any)
	if v, ok := req["cpu"].(string); ok {
		c.CPURequest = v
	}
	if v, ok := req["memory"].(string); ok {
		c.MemRequest = v
	}
	if v, ok := lim["cpu"].(string); ok {
		c.CPULimit = v
	}
	if v, ok := lim["memory"].(string); ok {
		c.MemLimit = v
	}
	return c
}

func writeEnvConfigs(spec *gen.ReleaseBindingSpec, c envConfigs) {
	m := map[string]any{}
	if spec.ComponentTypeEnvironmentConfigs != nil {
		m = *spec.ComponentTypeEnvironmentConfigs
	}
	m["replicas"] = c.Replicas
	m["imagePullPolicy"] = c.PullPolicy
	m["resources"] = map[string]any{
		"requests": map[string]any{"cpu": c.CPURequest, "memory": c.MemRequest},
		"limits":   map[string]any{"cpu": c.CPULimit, "memory": c.MemLimit},
	}
	spec.ComponentTypeEnvironmentConfigs = &m
}

// Containers returns the environment's (single) container.
func (s *Service) Containers(ctx context.Context, webAppID, trackID, env string) ([]Container, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	c := readEnvConfigs(b.Spec)
	out := Container{
		ID: "main", Name: "main", ImagePullPolicy: c.PullPolicy,
		CPURequest: ParseCPU(c.CPURequest), CPULimit: ParseCPU(c.CPULimit),
		MemoryRequest: ParseMemory(c.MemRequest) >> 20, MemoryLimit: ParseMemory(c.MemLimit) >> 20,
		Command: []string{}, Args: []string{}, Ports: []ContainerPort{},
		UpdatedAt: ts(b.Metadata.CreationTimestamp),
	}
	if b.Status != nil && b.Status.LastSpecUpdateTime != nil {
		out.UpdatedAt = ts(b.Status.LastSpecUpdateTime)
	}
	if r, err := s.oc.GetComponentRelease(ctx, ns(ctx), releaseOf(*b)); err == nil && r.Spec != nil {
		if cont, ok := r.Spec.Workload["container"].(map[string]any); ok {
			out.Image, _ = cont["image"].(string)
			out.Command = strList(cont["command"])
			out.Args = strList(cont["args"])
		}
		if eps, ok := r.Spec.Workload["endpoints"].(map[string]any); ok {
			for _, ep := range eps {
				m, _ := ep.(map[string]any)
				if p, ok := m["port"].(float64); ok {
					proto := "TCP"
					if m["type"] == "UDP" {
						proto = "UDP"
					}
					out.Ports = append(out.Ports, ContainerPort{Protocol: proto, Port: int(p)})
				}
			}
		}
	}
	return []Container{out}, nil
}

func strList(v any) []string {
	out := []string{}
	if l, ok := v.([]any); ok {
		for _, x := range l {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
	}
	return out
}

// UpdateContainer sets resources and pull policy for an environment
// (ReleaseBinding componentTypeEnvironmentConfigs). Command/args are part of
// the build's workload and are not overridable per environment on OC 1.2.5.
func (s *Service) UpdateContainer(ctx context.Context, webAppID, trackID, env, containerID string, u ContainerUpdate) (*Container, error) {
	if containerID != "main" {
		return nil, errf(CodeNotFound, "container %q not found", containerID)
	}
	cur, err := s.Containers(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	if !slices.Equal(nonNil(u.Command), cur[0].Command) || !slices.Equal(nonNil(u.Args), cur[0].Args) {
		return nil, errf(CodeNotSupported, "changing the container command or arguments is not supported yet")
	}
	if u.CPURequest <= 0 || u.CPULimit < u.CPURequest || u.MemoryRequest <= 0 || u.MemoryLimit < u.MemoryRequest {
		return nil, errf(CodeBadRequest, "requests must be positive and limits must be at least the requests")
	}
	if u.ImagePullPolicy != "Always" && u.ImagePullPolicy != "IfNotPresent" {
		return nil, errf(CodeBadRequest, "invalid image pull policy %q", u.ImagePullPolicy)
	}
	if AboveDefaultResources(u) {
		l, err := s.limits(ctx)
		if err != nil {
			return nil, err
		}
		if !l.CustomResources {
			return nil, planRequired("Container resources above the defaults (CPU %s, memory %s request / %s limit) are not included in your plan.", defaultCPULimit, defaultMemRequest, defaultMemLimit)
		}
	}
	t, _, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	if _, err := s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		c := readEnvConfigs(spec)
		c.PullPolicy = u.ImagePullPolicy
		c.CPURequest, c.CPULimit = FormatCPU(u.CPURequest), FormatCPU(u.CPULimit)
		c.MemRequest, c.MemLimit = FormatMemoryMi(u.MemoryRequest), FormatMemoryMi(u.MemoryLimit)
		writeEnvConfigs(spec, c)
	}); err != nil {
		return nil, err
	}
	out, err := s.Containers(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	return &out[0], nil
}

// AboveDefaultResources reports whether u asks for more than the CT
// defaults (a paid-plan feature).
func AboveDefaultResources(u ContainerUpdate) bool {
	return u.CPURequest > ParseCPU(defaultCPURequest) || u.CPULimit > ParseCPU(defaultCPULimit) ||
		u.MemoryRequest > ParseMemory(defaultMemRequest)>>20 || u.MemoryLimit > ParseMemory(defaultMemLimit)>>20
}

func nonNil(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

// Default HPA settings shown while autoscaling is off.
const (
	defaultHPAMin = 1
	defaultHPAMax = 3
	defaultHPACPU = 70
)

// hpaConfig reads the binding's HPA trait config (traitEnvironmentConfigs).
func hpaConfig(spec *gen.ReleaseBindingSpec) (enabled bool, h HPASettings) {
	h = HPASettings{MinReplicas: defaultHPAMin, MaxReplicas: defaultHPAMax}
	if spec == nil || spec.TraitEnvironmentConfigs == nil {
		cpu := defaultHPACPU
		h.CPUUtilization = &cpu
		return false, h
	}
	m, _ := (*spec.TraitEnvironmentConfigs)[platformres.HPATraitInstance].(map[string]any)
	enabled, _ = m["enabled"].(bool)
	if v := intOf(m["minReplicas"]); v > 0 {
		h.MinReplicas = v
	}
	if v := intOf(m["maxReplicas"]); v > 0 {
		h.MaxReplicas = v
	}
	if v := intOf(m["cpuUtilization"]); v > 0 {
		h.CPUUtilization = &v
	}
	if v := intOf(m["memoryUtilization"]); v > 0 {
		h.MemoryUtilization = &v
	}
	if h.CPUUtilization == nil && h.MemoryUtilization == nil && !enabled {
		cpu := defaultHPACPU
		h.CPUUtilization = &cpu
	}
	return enabled, h
}

func setHPAConfig(spec *gen.ReleaseBindingSpec, enabled bool, h HPASettings) {
	m := map[string]any{}
	if spec.TraitEnvironmentConfigs != nil {
		m = *spec.TraitEnvironmentConfigs
	}
	// The settings are kept while disabled, so the console shows them again.
	// Values a disabled trait would reject are dropped instead.
	cfg := map[string]any{"enabled": enabled}
	if h.MinReplicas >= minReplicas && h.MaxReplicas <= maxReplicas && h.MinReplicas <= h.MaxReplicas {
		cfg["minReplicas"], cfg["maxReplicas"] = h.MinReplicas, h.MaxReplicas
	}
	for key, v := range map[string]*int{"cpuUtilization": h.CPUUtilization, "memoryUtilization": h.MemoryUtilization} {
		if v != nil && *v >= 1 && *v <= 100 {
			cfg[key] = *v
		}
	}
	m[platformres.HPATraitInstance] = cfg
	spec.TraitEnvironmentConfigs = &m
}

func toScaling(spec *gen.ReleaseBindingSpec) *ScalingConfig {
	enabled, h := hpaConfig(spec)
	out := &ScalingConfig{Method: ScaleNone, FixedReplicas: readEnvConfigs(spec).Replicas, HPA: h}
	if enabled {
		out.Method = ScaleHPA
	}
	return out
}

// Scaling methods (frontend ScalingMethod).
const (
	ScaleHPA  = "HPA"
	ScaleNone = "None"
)

// Scaling returns the environment's scaling config.
func (s *Service) Scaling(ctx context.Context, webAppID, trackID, env string) (*ScalingConfig, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	return toScaling(b.Spec), nil
}

// ValidateScaling checks a scaling config against the plan limits.
func ValidateScaling(in ScalingConfig, l PlanLimits) error {
	switch in.Method {
	case ScaleHPA:
		if !l.Autoscaling {
			return planRequired("Autoscaling is not included in your plan.")
		}
		h := in.HPA
		if h.MinReplicas < minReplicas || h.MaxReplicas > maxReplicas || h.MinReplicas > h.MaxReplicas {
			return errf(CodeBadRequest, "autoscaling needs %d <= min replicas <= max replicas <= %d", minReplicas, maxReplicas)
		}
		if h.CPUUtilization == nil && h.MemoryUtilization == nil {
			return errf(CodeBadRequest, "autoscaling needs a CPU or a memory utilization target")
		}
		for _, t := range []*int{h.CPUUtilization, h.MemoryUtilization} {
			if t != nil && (*t < 1 || *t > 100) {
				return errf(CodeBadRequest, "utilization targets must be 1-100%%")
			}
		}
	case ScaleNone:
		if in.FixedReplicas < minReplicas || in.FixedReplicas > maxReplicas {
			return errf(CodeBadRequest, "replicas must be between %d and %d", minReplicas, maxReplicas)
		}
		if in.FixedReplicas > l.MaxReplicas {
			return planRequired("Running more than %d replica is not included in your plan.", l.MaxReplicas)
		}
	default:
		return errf(CodeBadRequest, "unknown scaling method %q", in.Method)
	}
	return nil
}

// UpdateScaling sets fixed replicas (1..5) or HPA autoscaling (paid plans).
// The HPA trait owns the replica count while enabled.
func (s *Service) UpdateScaling(ctx context.Context, webAppID, trackID, env string, in ScalingConfig) (*ScalingConfig, error) {
	t, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	l, err := s.limits(ctx)
	if err != nil {
		return nil, err
	}
	if err := ValidateScaling(in, l); err != nil {
		return nil, err
	}
	mutate := func(spec *gen.ReleaseBindingSpec) {
		if in.Method == ScaleHPA {
			setHPAConfig(spec, true, in.HPA)
			return
		}
		setHPAConfig(spec, false, in.HPA)
		c := readEnvConfigs(spec)
		c.Replicas = in.FixedReplicas
		writeEnvConfigs(spec, c)
	}
	var saved *gen.ReleaseBinding
	if enabled, _ := hpaConfig(b.Spec); in.Method == ScaleHPA || enabled {
		// The HPA trait must be in the bound release (re-cut if needed).
		saved, err = s.applyP1Binding(ctx, *t, env, mutate)
	} else {
		saved, err = s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, mutate)
	}
	if err != nil {
		return nil, err
	}
	return toScaling(saved.Spec), nil
}

// Replicas lists the environment's pods as replicas.
func (s *Service) Replicas(ctx context.Context, webAppID, trackID, env string) ([]ReplicaPod, error) {
	pods, err := s.Pods(ctx, webAppID, trackID, env)
	if err != nil {
		if e, ok := AsError(err); ok && e.Code == CodeNotFound {
			return []ReplicaPod{}, nil
		}
		return nil, err
	}
	out := make([]ReplicaPod, 0, len(pods))
	for _, p := range pods {
		st := "Pending"
		if p.Phase == "Running" {
			st = "Running"
		}
		var ready, total int
		_, _ = fmtSscanf(p.Ready, &ready, &total)
		out = append(out, ReplicaPod{Name: p.Name, Status: st, ReadyContainers: ready, TotalContainers: total, Restarts: p.Restarts, StartedAt: p.StartedAt})
	}
	return out, nil
}
