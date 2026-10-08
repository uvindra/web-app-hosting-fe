package webapp

import (
	"context"
	"strings"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// Probe types (frontend ProbeType).
const (
	ProbeHTTPGet = "httpGet"
	ProbeTCP     = "tcp"
	ProbeExec    = "exec"
)

// HTTPHeader is one probe request header.
type HTTPHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// Probe is the console's probe (frontend types/healthChecks.ts).
type Probe struct {
	Type                string `json:"type"`
	FailureThreshold    int    `json:"failureThreshold"`
	SuccessThreshold    int    `json:"successThreshold"`
	InitialDelaySeconds int    `json:"initialDelaySeconds"`
	PeriodSeconds       int    `json:"periodSeconds"`
	TimeoutSeconds      int    `json:"timeoutSeconds"`
	HTTPGet             *struct {
		Path        string       `json:"path"`
		Port        int          `json:"port"`
		HTTPHeaders []HTTPHeader `json:"httpHeaders"`
	} `json:"httpGet,omitempty"`
	TCPSocket *struct {
		Port int `json:"port"`
	} `json:"tcpSocket,omitempty"`
	Exec *struct {
		Command []string `json:"command"`
	} `json:"exec,omitempty"`
}

// HealthCheck is an environment's probes; an unset probe is nil. An unset
// readiness probe means the platform default (TCP connect on the web app's
// port).
type HealthCheck struct {
	LivenessProbe  *Probe `json:"livenessProbe,omitempty"`
	ReadinessProbe *Probe `json:"readinessProbe,omitempty"`
}

// Binding componentTypeEnvironmentConfigs keys (CT v3).
const (
	ecLiveness  = "livenessProbe"
	ecReadiness = "readinessProbe"
)

// HealthCheck returns an environment's probes.
func (s *Service) HealthCheck(ctx context.Context, webAppID, trackID, env string) (*HealthCheck, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	return readHealthCheck(b.Spec), nil
}

func readHealthCheck(spec *gen.ReleaseBindingSpec) *HealthCheck {
	out := &HealthCheck{}
	if spec == nil || spec.ComponentTypeEnvironmentConfigs == nil {
		return out
	}
	m := *spec.ComponentTypeEnvironmentConfigs
	out.LivenessProbe = probeFromK8s(m[ecLiveness])
	out.ReadinessProbe = probeFromK8s(m[ecReadiness])
	return out
}

// UpdateHealthCheck replaces an environment's probes (a nil probe removes
// it). The binding is re-applied, which rolls the pods.
func (s *Service) UpdateHealthCheck(ctx context.Context, webAppID, trackID, env string, in HealthCheck) (*HealthCheck, error) {
	t, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	port := s.boundPort(ctx, *b)
	for _, p := range []struct {
		probe    *Probe
		liveness bool
	}{{in.LivenessProbe, true}, {in.ReadinessProbe, false}} {
		if p.probe == nil {
			continue
		}
		if err := validateProbe(*p.probe, p.liveness, port); err != nil {
			return nil, err
		}
	}
	saved, err := s.applyP1Binding(ctx, *t, env, func(spec *gen.ReleaseBindingSpec) { writeHealthCheck(spec, in) })
	if err != nil {
		return nil, err
	}
	return readHealthCheck(saved.Spec), nil
}

// DeleteHealthCheck removes both probes (readiness falls back to the
// platform default).
func (s *Service) DeleteHealthCheck(ctx context.Context, webAppID, trackID, env string) error {
	_, err := s.UpdateHealthCheck(ctx, webAppID, trackID, env, HealthCheck{})
	return err
}

func writeHealthCheck(spec *gen.ReleaseBindingSpec, hc HealthCheck) {
	m := map[string]any{}
	if spec.ComponentTypeEnvironmentConfigs != nil {
		m = *spec.ComponentTypeEnvironmentConfigs
	}
	set := func(key string, p *Probe) {
		if p == nil {
			delete(m, key)
			return
		}
		m[key] = probeToK8s(*p)
	}
	set(ecLiveness, hc.LivenessProbe)
	set(ecReadiness, hc.ReadinessProbe)
	spec.ComponentTypeEnvironmentConfigs = &m
}

// boundPort returns the endpoint port of the release bound to b (0 when unknown).
func (s *Service) boundPort(ctx context.Context, b gen.ReleaseBinding) int {
	r, err := s.oc.GetComponentRelease(ctx, ns(ctx), releaseOf(b))
	if err != nil || r.Spec == nil {
		return 0
	}
	eps, _ := r.Spec.Workload["endpoints"].(map[string]any)
	for _, ep := range eps {
		if m, ok := ep.(map[string]any); ok {
			if p, ok := m["port"].(float64); ok {
				return int(p)
			}
		}
	}
	return 0
}

func validateProbe(p Probe, liveness bool, port int) error {
	kind := "readiness"
	if liveness {
		kind = "liveness"
	}
	bad := func(format string, a ...any) error {
		return errf(CodeBadRequest, kind+" probe: "+format, a...)
	}
	switch {
	case p.InitialDelaySeconds < 0 || p.InitialDelaySeconds > 3600:
		return bad("initial delay must be 0-3600 seconds")
	case p.PeriodSeconds < 1 || p.PeriodSeconds > 3600:
		return bad("period must be 1-3600 seconds")
	case p.TimeoutSeconds < 1 || p.TimeoutSeconds > 3600:
		return bad("timeout must be 1-3600 seconds")
	case p.FailureThreshold < 1 || p.FailureThreshold > 100:
		return bad("failure threshold must be 1-100")
	case p.SuccessThreshold < 1 || p.SuccessThreshold > 100:
		return bad("success threshold must be 1-100")
	case liveness && p.SuccessThreshold != 1:
		return bad("success threshold must be 1")
	}
	checkPort := func(got int) error {
		if port > 0 && got != port {
			return bad("port must be the web app's port %d", port)
		}
		if got < 1 || got > 65535 {
			return bad("invalid port %d", got)
		}
		return nil
	}
	switch p.Type {
	case ProbeHTTPGet:
		if p.HTTPGet == nil {
			return bad("httpGet is required")
		}
		if !strings.HasPrefix(p.HTTPGet.Path, "/") {
			return bad("path must start with /")
		}
		for _, h := range p.HTTPGet.HTTPHeaders {
			if strings.TrimSpace(h.Name) == "" {
				return bad("header names are required")
			}
		}
		return checkPort(p.HTTPGet.Port)
	case ProbeTCP:
		if p.TCPSocket == nil {
			return bad("tcpSocket is required")
		}
		return checkPort(p.TCPSocket.Port)
	case ProbeExec:
		if p.Exec == nil || len(p.Exec.Command) == 0 || strings.TrimSpace(p.Exec.Command[0]) == "" {
			return bad("a command is required")
		}
		return nil
	default:
		return bad("unknown probe type %q", p.Type)
	}
}

// probeToK8s maps a console probe to a Kubernetes probe object (only the
// handler of its type).
func probeToK8s(p Probe) map[string]any {
	m := map[string]any{
		"initialDelaySeconds": p.InitialDelaySeconds, "periodSeconds": p.PeriodSeconds, "timeoutSeconds": p.TimeoutSeconds,
		"failureThreshold": p.FailureThreshold, "successThreshold": p.SuccessThreshold,
	}
	switch p.Type {
	case ProbeHTTPGet:
		headers := []any{}
		for _, h := range p.HTTPGet.HTTPHeaders {
			headers = append(headers, map[string]any{"name": strings.TrimSpace(h.Name), "value": h.Value})
		}
		g := map[string]any{"path": p.HTTPGet.Path, "port": p.HTTPGet.Port}
		if len(headers) > 0 {
			g["httpHeaders"] = headers
		}
		m["httpGet"] = g
	case ProbeTCP:
		m["tcpSocket"] = map[string]any{"port": p.TCPSocket.Port}
	case ProbeExec:
		m["exec"] = map[string]any{"command": p.Exec.Command}
	}
	return m
}

// probeFromK8s maps a stored probe back; nil when v holds no handler (e.g.
// unset, or only default timings).
func probeFromK8s(v any) *Probe {
	m, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	num := func(k string, def int) int {
		if f, ok := m[k].(float64); ok {
			return int(f)
		}
		if i, ok := m[k].(int); ok {
			return i
		}
		return def
	}
	p := &Probe{
		InitialDelaySeconds: num("initialDelaySeconds", 0), PeriodSeconds: num("periodSeconds", 10), TimeoutSeconds: num("timeoutSeconds", 1),
		FailureThreshold: num("failureThreshold", 3), SuccessThreshold: num("successThreshold", 1),
	}
	switch {
	case m["httpGet"] != nil:
		g, _ := m["httpGet"].(map[string]any)
		p.Type = ProbeHTTPGet
		p.HTTPGet = &struct {
			Path        string       `json:"path"`
			Port        int          `json:"port"`
			HTTPHeaders []HTTPHeader `json:"httpHeaders"`
		}{HTTPHeaders: []HTTPHeader{}}
		p.HTTPGet.Path, _ = g["path"].(string)
		p.HTTPGet.Port = intOf(g["port"])
		if hs, ok := g["httpHeaders"].([]any); ok {
			for _, h := range hs {
				hm, _ := h.(map[string]any)
				name, _ := hm["name"].(string)
				value, _ := hm["value"].(string)
				p.HTTPGet.HTTPHeaders = append(p.HTTPGet.HTTPHeaders, HTTPHeader{Name: name, Value: value})
			}
		}
	case m["tcpSocket"] != nil:
		t, _ := m["tcpSocket"].(map[string]any)
		p.Type = ProbeTCP
		p.TCPSocket = &struct {
			Port int `json:"port"`
		}{Port: intOf(t["port"])}
	case m["exec"] != nil:
		e, _ := m["exec"].(map[string]any)
		p.Type = ProbeExec
		p.Exec = &struct {
			Command []string `json:"command"`
		}{Command: strList(e["command"])}
	default:
		return nil
	}
	return p
}

func intOf(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return 0
}
