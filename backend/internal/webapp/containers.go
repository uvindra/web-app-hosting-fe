package webapp

import (
	"context"
	"slices"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
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

func nonNil(l []string) []string {
	if l == nil {
		return []string{}
	}
	return l
}

// Scaling returns the environment's scaling config (P0: fixed replicas).
func (s *Service) Scaling(ctx context.Context, webAppID, trackID, env string) (*ScalingConfig, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	c := readEnvConfigs(b.Spec)
	return &ScalingConfig{Method: "None", FixedReplicas: c.Replicas, HPA: HPASettings{MinReplicas: 1, MaxReplicas: 3}}, nil
}

// UpdateScaling sets fixed replicas (1..5). HPA is P1.
func (s *Service) UpdateScaling(ctx context.Context, webAppID, trackID, env string, in ScalingConfig) (*ScalingConfig, error) {
	if in.Method != "None" {
		return nil, errf(CodeNotSupported, "autoscaling is not available yet")
	}
	if in.FixedReplicas < minReplicas || in.FixedReplicas > maxReplicas {
		return nil, errf(CodeBadRequest, "replicas must be between %d and %d", minReplicas, maxReplicas)
	}
	t, _, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	if _, err := s.oc.ApplyReleaseBinding(ctx, ns(ctx), t.Project, t.Name, env, func(spec *gen.ReleaseBindingSpec) {
		c := readEnvConfigs(spec)
		c.Replicas = in.FixedReplicas
		writeEnvConfigs(spec, c)
	}); err != nil {
		return nil, err
	}
	return s.Scaling(ctx, webAppID, trackID, env)
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
