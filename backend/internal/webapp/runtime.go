package webapp

import (
	"context"
	"sort"
	"strconv"
	"strings"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// activeBinding returns the track's binding in env, or NOT_FOUND.
func (s *Service) activeBinding(ctx context.Context, webAppID, trackID, env string) (*track, *gen.ReleaseBinding, error) {
	t, bindings, _, err := s.trackState(ctx, webAppID, trackID, false)
	if err != nil {
		return nil, nil, err
	}
	b, ok := bindings[env]
	if !ok || releaseOf(b) == "" {
		return nil, nil, errf(CodeNotFound, "not deployed to %s", env)
	}
	return t, &b, nil
}

// ReleaseDetails returns what runs in an environment.
func (s *Service) ReleaseDetails(ctx context.Context, webAppID, trackID, env string) (*ReleaseDetails, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	rel := releaseOf(*b)
	out := &ReleaseDetails{DeployedAt: ts(b.Metadata.CreationTimestamp)}
	if b.Status != nil && b.Status.LastSpecUpdateTime != nil {
		out.DeployedAt = ts(b.Status.LastSpecUpdateTime)
	}
	switch deploymentStatus(*b) {
	case DeployActive:
		out.Status = "Running"
	case DeployFailed:
		out.Status = "Failed"
	default:
		out.Status = "Deploying"
	}
	if r, err := s.oc.GetComponentRelease(ctx, ns(ctx), rel); err == nil && r.Spec != nil {
		if c, ok := r.Spec.Workload["container"].(map[string]any); ok {
			out.Image, _ = c["image"].(string)
		}
		if eps, ok := r.Spec.Workload["endpoints"].(map[string]any); ok {
			for _, ep := range eps {
				if m, ok := ep.(map[string]any); ok {
					if p, ok := m["port"].(float64); ok {
						out.Port = int(p)
						break
					}
				}
			}
		}
	}
	if run, err := s.oc.GetWorkflowRun(ctx, ns(ctx), rel); err == nil {
		out.CommitSHA, out.CommitMessage = annotation(run.Metadata, AnnCommitSHA), annotation(run.Metadata, AnnCommitMessage)
	}
	return out, nil
}

// Pods lists the environment's pods from the binding's resource tree.
func (s *Service) Pods(ctx context.Context, webAppID, trackID, env string) ([]Pod, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	tree, err := s.oc.ResourceTree(ctx, ns(ctx), b.Metadata.Name)
	if err != nil {
		if notFound(err) {
			return []Pod{}, nil
		}
		return nil, err
	}
	out := []Pod{}
	for _, rel := range tree.RenderedReleases {
		for _, n := range rel.Nodes {
			if n.Kind == "Pod" {
				out = append(out, PodFromObject(n.Name, n.Object))
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
	return out, nil
}

// PodFromObject maps an unstructured Pod to the console's Pod.
func PodFromObject(name string, obj map[string]any) Pod {
	p := Pod{Name: name, Phase: "Pending", Conditions: []PodCondition{}}
	status, _ := obj["status"].(map[string]any)
	spec, _ := obj["spec"].(map[string]any)
	if ph, ok := status["phase"].(string); ok {
		p.Phase = ph
	}
	p.StartedAt, _ = status["startTime"].(string)
	total, ready := 0, 0
	if cs, ok := status["containerStatuses"].([]any); ok {
		for _, c := range cs {
			m, _ := c.(map[string]any)
			total++
			if r, _ := m["ready"].(bool); r {
				ready++
			}
			if rc, ok := m["restartCount"].(float64); ok {
				p.Restarts += int(rc)
			}
		}
	}
	if containers, ok := spec["containers"].([]any); ok {
		if total == 0 {
			total = len(containers)
		}
		if len(containers) > 0 {
			c, _ := containers[0].(map[string]any)
			res, _ := c["resources"].(map[string]any)
			lim, _ := res["limits"].(map[string]any)
			cpu, _ := lim["cpu"].(string)
			mem, _ := lim["memory"].(string)
			p.CPULimitMillicores, p.MemoryLimitBytes = ParseCPU(cpu), ParseMemory(mem)
		}
	}
	p.Ready = itoa(ready) + "/" + itoa(total)
	if conds, ok := status["conditions"].([]any); ok {
		for _, c := range conds {
			m, _ := c.(map[string]any)
			typ, _ := m["type"].(string)
			st, _ := m["status"].(string)
			lt, _ := m["lastTransitionTime"].(string)
			switch typ {
			case "PodScheduled", "Initialized", "ContainersReady", "Ready":
				p.Conditions = append(p.Conditions, PodCondition{Type: typ, Status: st, LastTransitionTime: lt})
			}
		}
	}
	return p
}

func itoa(i int) string { return strconv.Itoa(i) }

// PodEvents lists a pod's Kubernetes events.
func (s *Service) PodEvents(ctx context.Context, webAppID, trackID, env, pod string) ([]PodEvent, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	evs, err := s.oc.PodEvents(ctx, ns(ctx), b.Metadata.Name, pod)
	if err != nil {
		return nil, err
	}
	out := make([]PodEvent, 0, len(evs))
	for _, e := range evs {
		pe := PodEvent{Type: e.Type, Reason: e.Reason, Message: e.Message, Count: 1, LastSeen: ts(e.LastTimestamp)}
		if e.Count != nil {
			pe.Count = *e.Count
		}
		if pe.LastSeen == "" {
			pe.LastSeen = ts(e.FirstTimestamp)
		}
		out = append(out, pe)
	}
	return out, nil
}

// PodLogs returns a pod's recent log lines (live, from the data plane).
func (s *Service) PodLogs(ctx context.Context, webAppID, trackID, env, pod string) ([]string, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	entries, err := s.oc.PodLogs(ctx, ns(ctx), b.Metadata.Name, pod, 3600)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, strings.TrimRight(e.Log, "\n"))
	}
	return out, nil
}
