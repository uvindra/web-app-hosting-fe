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
package openchoreo

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// Client is the BFF's typed OpenChoreo client. Every write is stamped with
// the configured resource labels. Methods take the OC namespace explicitly.
type Client struct {
	oc     *gen.ClientWithResponses
	labels resourceLabels
}

// New builds a Client.
func New(cfg Config) (*Client, error) {
	if err := ValidateResourceLabels(cfg.ResourceLabels); err != nil {
		return nil, err
	}
	oc, err := newGenClient(cfg)
	if err != nil {
		return nil, err
	}
	return &Client{oc: oc, labels: newResourceLabels(cfg.ResourceLabels)}, nil
}

// Raw exposes the generated client for calls not wrapped here.
func (c *Client) Raw() *gen.ClientWithResponses { return c.oc }

func ok(status int) bool { return status >= 200 && status < 300 }

func ptr[T any](v T) *T { return &v }

// ---- namespaces ----

// ListNamespaces lists namespaces visible to the caller (on WSO2 Cloud the
// platform API scopes this to the caller's org).
func (c *Client) ListNamespaces(ctx context.Context) ([]gen.Namespace, error) {
	r, err := c.oc.ListNamespacesWithResponse(ctx, &gen.ListNamespacesParams{})
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200.Items, nil
}

// ---- projects ----

func (c *Client) ListProjects(ctx context.Context, ns string) ([]gen.Project, error) {
	var out []gen.Project
	var cursor *string
	for {
		r, err := c.oc.ListProjectsWithResponse(ctx, ns, &gen.ListProjectsParams{Cursor: cursor})
		if err != nil {
			return nil, err
		}
		if r.JSON200 == nil {
			return nil, respError(r.StatusCode(), r.Body)
		}
		out = append(out, r.JSON200.Items...)
		next := nextCursor(r.JSON200.Pagination)
		if next == nil {
			return out, nil
		}
		cursor = next
	}
}

func (c *Client) GetProject(ctx context.Context, ns, name string) (*gen.Project, error) {
	r, err := c.oc.GetProjectWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

func (c *Client) CreateProject(ctx context.Context, ns string, p gen.Project) (*gen.Project, error) {
	c.labels.stamp(&p.Metadata)
	r, err := c.oc.CreateProjectWithResponse(ctx, ns, gen.CreateProjectJSONRequestBody(p))
	if err != nil {
		return nil, err
	}
	if r.JSON201 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON201, nil
}

// ---- environments / pipelines ----

func (c *Client) ListEnvironments(ctx context.Context, ns string) ([]gen.Environment, error) {
	r, err := c.oc.ListEnvironmentsWithResponse(ctx, ns, &gen.ListEnvironmentsParams{})
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200.Items, nil
}

func (c *Client) GetDeploymentPipeline(ctx context.Context, ns, name string) (*gen.DeploymentPipeline, error) {
	r, err := c.oc.GetDeploymentPipelineWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

// ---- components ----

// ListComponents lists a project's components, optionally filtered by a label selector.
func (c *Client) ListComponents(ctx context.Context, ns, project, selector string) ([]gen.Component, error) {
	var out []gen.Component
	var cursor *string
	for {
		p := &gen.ListComponentsParams{Cursor: cursor}
		if project != "" {
			p.Project = ptr(project)
		}
		if selector != "" {
			p.LabelSelector = ptr(selector)
		}
		r, err := c.oc.ListComponentsWithResponse(ctx, ns, p)
		if err != nil {
			return nil, err
		}
		if r.JSON200 == nil {
			return nil, respError(r.StatusCode(), r.Body)
		}
		out = append(out, r.JSON200.Items...)
		next := nextCursor(r.JSON200.Pagination)
		if next == nil {
			return out, nil
		}
		cursor = next
	}
}

func (c *Client) GetComponent(ctx context.Context, ns, name string) (*gen.Component, error) {
	r, err := c.oc.GetComponentWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

func (c *Client) CreateComponent(ctx context.Context, ns string, comp gen.Component) (*gen.Component, error) {
	c.labels.stamp(&comp.Metadata)
	r, err := c.oc.CreateComponentWithResponse(ctx, ns, gen.CreateComponentJSONRequestBody(comp))
	if err != nil {
		return nil, err
	}
	if r.JSON201 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON201, nil
}

// MutateComponent read-modify-writes a Component (retrying lost races).
func (c *Client) MutateComponent(ctx context.Context, ns, name string, mutate func(*gen.Component)) (*gen.Component, error) {
	var out *gen.Component
	err := retryStaleWrite(ctx, "component/"+name, func(ctx context.Context) error {
		cur, err := c.GetComponent(ctx, ns, name)
		if err != nil {
			return err
		}
		mutate(cur)
		c.labels.stamp(&cur.Metadata)
		r, err := c.oc.UpdateComponentWithResponse(ctx, ns, name, gen.UpdateComponentJSONRequestBody(*cur))
		if err != nil {
			return err
		}
		if r.JSON200 == nil {
			return respError(r.StatusCode(), r.Body)
		}
		out = r.JSON200
		return nil
	})
	return out, err
}

func (c *Client) DeleteComponent(ctx context.Context, ns, name string) error {
	r, err := c.oc.DeleteComponentWithResponse(ctx, ns, name)
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) && r.StatusCode() != http.StatusNotFound {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

// ---- workloads ----

// GetComponentWorkload returns the component's Workload, or (nil, nil) when it has none yet.
func (c *Client) GetComponentWorkload(ctx context.Context, ns, component string) (*gen.Workload, error) {
	r, err := c.oc.ListWorkloadsWithResponse(ctx, ns, &gen.ListWorkloadsParams{Component: ptr(component)})
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	for i := range r.JSON200.Items {
		w := r.JSON200.Items[i]
		if w.Spec != nil && w.Spec.Owner != nil && w.Spec.Owner.ComponentName == component {
			return &w, nil
		}
	}
	return nil, nil
}

func (c *Client) CreateWorkload(ctx context.Context, ns string, w gen.Workload) (*gen.Workload, error) {
	c.labels.stamp(&w.Metadata)
	r, err := c.oc.CreateWorkloadWithResponse(ctx, ns, gen.CreateWorkloadJSONRequestBody(w))
	if err != nil {
		return nil, err
	}
	if r.JSON201 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON201, nil
}

func (c *Client) UpdateWorkload(ctx context.Context, ns string, w gen.Workload) error {
	c.labels.stamp(&w.Metadata)
	r, err := c.oc.UpdateWorkloadWithResponse(ctx, ns, w.Metadata.Name, gen.UpdateWorkloadJSONRequestBody(w))
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

// ---- workflow runs ----

func (c *Client) ListWorkflowRuns(ctx context.Context, ns, selector string) ([]gen.WorkflowRun, error) {
	var out []gen.WorkflowRun
	var cursor *string
	for {
		p := &gen.ListWorkflowRunsParams{Cursor: cursor}
		if selector != "" {
			p.LabelSelector = ptr(selector)
		}
		r, err := c.oc.ListWorkflowRunsWithResponse(ctx, ns, p)
		if err != nil {
			return nil, err
		}
		if r.JSON200 == nil {
			return nil, respError(r.StatusCode(), r.Body)
		}
		out = append(out, r.JSON200.Items...)
		next := nextCursor(r.JSON200.Pagination)
		if next == nil {
			return out, nil
		}
		cursor = next
	}
}

func (c *Client) GetWorkflowRun(ctx context.Context, ns, name string) (*gen.WorkflowRun, error) {
	r, err := c.oc.GetWorkflowRunWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

func (c *Client) CreateWorkflowRun(ctx context.Context, ns string, run gen.WorkflowRun) (*gen.WorkflowRun, error) {
	c.labels.stamp(&run.Metadata)
	r, err := c.oc.CreateWorkflowRunWithResponse(ctx, ns, gen.CreateWorkflowRunJSONRequestBody(run))
	if err != nil {
		return nil, err
	}
	if r.JSON201 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON201, nil
}

// MutateWorkflowRun read-modify-writes a WorkflowRun (used to annotate runs).
func (c *Client) MutateWorkflowRun(ctx context.Context, ns, name string, mutate func(*gen.WorkflowRun)) error {
	return retryStaleWrite(ctx, "workflowrun/"+name, func(ctx context.Context) error {
		cur, err := c.GetWorkflowRun(ctx, ns, name)
		if err != nil {
			return err
		}
		mutate(cur)
		r, err := c.oc.UpdateWorkflowRunWithResponse(ctx, ns, name, gen.UpdateWorkflowRunJSONRequestBody(*cur))
		if err != nil {
			return err
		}
		if !ok(r.StatusCode()) {
			return respError(r.StatusCode(), r.Body)
		}
		return nil
	})
}

func (c *Client) GetWorkflowRunStatus(ctx context.Context, ns, name string) (*gen.WorkflowRunStatusResponse, error) {
	r, err := c.oc.GetWorkflowRunStatusWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

// GetWorkflowRunLogs returns live logs (only while the run's pods exist).
func (c *Client) GetWorkflowRunLogs(ctx context.Context, ns, name, task string) ([]gen.WorkflowRunLogEntry, error) {
	p := &gen.GetWorkflowRunLogsParams{}
	if task != "" {
		p.Task = ptr(task)
	}
	r, err := c.oc.GetWorkflowRunLogsWithResponse(ctx, ns, name, p)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return *r.JSON200, nil
}

// ---- releases / bindings ----

// GenerateRelease cuts a ComponentRelease from the component's current
// workload under the given name. Idempotent by read-back (OC answers a
// duplicate name with a bare 500 — see App Factory EnsureRelease).
func (c *Client) GenerateRelease(ctx context.Context, ns, component, release string) error {
	r, err := c.oc.GenerateReleaseWithResponse(ctx, ns, component, gen.GenerateReleaseJSONRequestBody{ReleaseName: ptr(release)})
	if err != nil {
		return fmt.Errorf("generate release for %q: %w", component, err)
	}
	if ok(r.StatusCode()) || r.StatusCode() == http.StatusConflict {
		return nil
	}
	if r.StatusCode() >= 500 {
		if g, gerr := c.oc.GetComponentReleaseWithResponse(ctx, ns, release); gerr == nil && g.JSON200 != nil {
			return nil
		}
	}
	return respError(r.StatusCode(), r.Body)
}

func (c *Client) GetComponentRelease(ctx context.Context, ns, name string) (*gen.ComponentRelease, error) {
	r, err := c.oc.GetComponentReleaseWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

// DeleteComponentRelease deletes a ComponentRelease (a missing one is not an error).
func (c *Client) DeleteComponentRelease(ctx context.Context, ns, name string) error {
	r, err := c.oc.DeleteComponentReleaseWithResponse(ctx, ns, name)
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) && r.StatusCode() != http.StatusNotFound {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

// ListReleaseBindings lists a component's bindings ("" = every binding in the namespace).
func (c *Client) ListReleaseBindings(ctx context.Context, ns, component string) ([]gen.ReleaseBinding, error) {
	var out []gen.ReleaseBinding
	var cursor *string
	for {
		p := &gen.ListReleaseBindingsParams{Cursor: cursor}
		if component != "" {
			p.Component = ptr(component)
		}
		r, err := c.oc.ListReleaseBindingsWithResponse(ctx, ns, p)
		if err != nil {
			return nil, err
		}
		if r.JSON200 == nil {
			return nil, respError(r.StatusCode(), r.Body)
		}
		out = append(out, r.JSON200.Items...)
		next := nextCursor(r.JSON200.Pagination)
		if next == nil {
			return out, nil
		}
		cursor = next
	}
}

func (c *Client) GetReleaseBinding(ctx context.Context, ns, name string) (*gen.ReleaseBinding, error) {
	r, err := c.oc.GetReleaseBindingWithResponse(ctx, ns, name)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

// ApplyReleaseBinding converges the component's binding in env (single
// writer, App Factory pattern): creates it with mutate applied to a bare
// spec, or read-modify-writes the existing one.
func (c *Client) ApplyReleaseBinding(ctx context.Context, ns, project, component, env string, mutate func(*gen.ReleaseBindingSpec)) (*gen.ReleaseBinding, error) {
	name := component + "-" + env
	existing, err := c.findBinding(ctx, ns, component, env)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		spec := gen.ReleaseBindingSpec{Environment: env}
		spec.Owner.ComponentName, spec.Owner.ProjectName = component, project
		mutate(&spec)
		body := gen.ReleaseBinding{Metadata: gen.ObjectMeta{Name: name}, Spec: &spec}
		c.labels.stamp(&body.Metadata)
		r, err := c.oc.CreateReleaseBindingWithResponse(ctx, ns, gen.CreateReleaseBindingJSONRequestBody(body))
		if err != nil {
			return nil, err
		}
		if r.JSON201 != nil {
			return r.JSON201, nil
		}
		if r.StatusCode() != http.StatusConflict {
			return nil, respError(r.StatusCode(), r.Body)
		}
	} else {
		name = existing.Metadata.Name
	}
	var out *gen.ReleaseBinding
	err = retryStaleWrite(ctx, "releasebinding/"+name, func(ctx context.Context) error {
		cur, err := c.GetReleaseBinding(ctx, ns, name)
		if err != nil {
			return err
		}
		if cur.Spec == nil {
			cur.Spec = &gen.ReleaseBindingSpec{Environment: env}
		}
		mutate(cur.Spec)
		c.labels.stamp(&cur.Metadata)
		r, err := c.oc.UpdateReleaseBindingWithResponse(ctx, ns, name, gen.UpdateReleaseBindingJSONRequestBody(*cur))
		if err != nil {
			return err
		}
		if r.JSON200 == nil {
			return respError(r.StatusCode(), r.Body)
		}
		out = r.JSON200
		return nil
	})
	return out, err
}

// FindBinding returns the component's binding for env, or nil.
func (c *Client) FindBinding(ctx context.Context, ns, component, env string) (*gen.ReleaseBinding, error) {
	return c.findBinding(ctx, ns, component, env)
}

func (c *Client) findBinding(ctx context.Context, ns, component, env string) (*gen.ReleaseBinding, error) {
	items, err := c.ListReleaseBindings(ctx, ns, component)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].Spec != nil && items[i].Spec.Environment == env && items[i].Spec.Owner.ComponentName == component {
			return &items[i], nil
		}
	}
	return nil, nil
}

func (c *Client) DeleteReleaseBinding(ctx context.Context, ns, name string) error {
	r, err := c.oc.DeleteReleaseBindingWithResponse(ctx, ns, name)
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) && r.StatusCode() != http.StatusNotFound {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

// ---- runtime (k8s resources rendered by a binding) ----

func (c *Client) ResourceTree(ctx context.Context, ns, binding string) (*gen.K8sResourceTreeResponse, error) {
	r, err := c.oc.GetReleaseBindingK8sResourceTreeWithResponse(ctx, ns, binding)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200, nil
}

func (c *Client) PodEvents(ctx context.Context, ns, binding, pod string) ([]gen.ResourceEvent, error) {
	group := ""
	r, err := c.oc.GetReleaseBindingK8sResourceEventsWithResponse(ctx, ns, binding, &gen.GetReleaseBindingK8sResourceEventsParams{
		Group: &group, Version: "v1", Kind: "Pod", Name: pod,
	})
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200.Events, nil
}

func (c *Client) PodLogs(ctx context.Context, ns, binding, pod string, sinceSeconds int64) ([]gen.PodLogEntry, error) {
	p := &gen.GetReleaseBindingK8sResourceLogsParams{PodName: pod}
	if sinceSeconds > 0 {
		p.SinceSeconds = &sinceSeconds
	}
	r, err := c.oc.GetReleaseBindingK8sResourceLogsWithResponse(ctx, ns, binding, p)
	if err != nil {
		return nil, err
	}
	if r.JSON200 == nil {
		return nil, respError(r.StatusCode(), r.Body)
	}
	return r.JSON200.LogEntries, nil
}

// ---- secrets (OC Secret API, local target) ----

func (c *Client) CreateSecret(ctx context.Context, ns string, req gen.CreateSecretRequest) error {
	if len(c.labels) > 0 {
		l := map[string]string{}
		if req.Labels != nil {
			l = *req.Labels
		}
		for k, v := range c.labels {
			l[k] = v
		}
		req.Labels = &l
	}
	r, err := c.oc.CreateSecretWithResponse(ctx, ns, gen.CreateSecretJSONRequestBody(req))
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

func (c *Client) UpdateSecret(ctx context.Context, ns, name string, data map[string]string) error {
	r, err := c.oc.UpdateSecretWithResponse(ctx, ns, name, gen.UpdateSecretJSONRequestBody{Data: data})
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

func (c *Client) DeleteSecret(ctx context.Context, ns, name string) error {
	r, err := c.oc.DeleteSecretWithResponse(ctx, ns, name)
	if err != nil {
		return err
	}
	if !ok(r.StatusCode()) && r.StatusCode() != http.StatusNotFound {
		return respError(r.StatusCode(), r.Body)
	}
	return nil
}

func nextCursor(p gen.Pagination) *string {
	if p.NextCursor == nil || *p.NextCursor == "" {
		return nil
	}
	return p.NextCursor
}

// EnsureProjectReleaseBinding get-or-creates `<project>-<env>`, which gives
// the project its data-plane namespace in env. spec.projectRelease is left
// unset so the Project controller pins the latest release (App Factory
// project_cell_client.go).
func (c *Client) EnsureProjectReleaseBinding(ctx context.Context, ns, project, env string) error {
	body := gen.ProjectReleaseBinding{Metadata: gen.ObjectMeta{Name: project + "-" + env}}
	body.Spec = &gen.ProjectReleaseBindingSpec{Environment: env}
	body.Spec.Owner.ProjectName = project
	c.labels.stamp(&body.Metadata)
	r, err := c.oc.CreateProjectReleaseBindingWithResponse(ctx, ns, gen.CreateProjectReleaseBindingJSONRequestBody(body))
	if err != nil {
		return err
	}
	if ok(r.StatusCode()) || r.StatusCode() == http.StatusConflict {
		return nil
	}
	return respError(r.StatusCode(), r.Body)
}

// MutateReleaseBinding read-modify-writes an existing binding, including its
// metadata (e.g. BFF bookkeeping annotations).
func (c *Client) MutateReleaseBinding(ctx context.Context, ns, name string, mutate func(*gen.ReleaseBinding) error) (*gen.ReleaseBinding, error) {
	var out *gen.ReleaseBinding
	err := retryStaleWrite(ctx, "releasebinding/"+name, func(ctx context.Context) error {
		cur, err := c.GetReleaseBinding(ctx, ns, name)
		if err != nil {
			return err
		}
		if cur.Spec == nil {
			cur.Spec = &gen.ReleaseBindingSpec{}
		}
		if err := mutate(cur); err != nil {
			return &permanentError{err}
		}
		c.labels.stamp(&cur.Metadata)
		r, err := c.oc.UpdateReleaseBindingWithResponse(ctx, ns, name, gen.UpdateReleaseBindingJSONRequestBody(*cur))
		if err != nil {
			return err
		}
		if r.JSON200 == nil {
			return respError(r.StatusCode(), r.Body)
		}
		out = r.JSON200
		return nil
	})
	var pe *permanentError
	if errors.As(err, &pe) {
		return nil, pe.err
	}
	return out, err
}

// permanentError carries a mutate callback's error out of retryStaleWrite unretried.
type permanentError struct{ err error }

func (e *permanentError) Error() string { return e.err.Error() }
