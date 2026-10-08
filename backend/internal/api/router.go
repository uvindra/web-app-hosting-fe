// Package api is the BFF's HTTP surface under BASE_PATH
// (/webapp-hosting/api/v1). The contract is api/openapi.yaml; Routes must
// stay in sync with it (enforced by TestRoutesMatchOpenAPI).
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/platform"
	"github.com/wso2/web-app-hosting/backend/internal/webapp"
)

// Route is one API operation.
type Route struct {
	Method, Path string
	Handle       func(h *handlers, w http.ResponseWriter, r *http.Request)
}

const track = "/webapps/{webAppId}/tracks/{trackId}"

// Routes is the API surface (paths relative to the base path).
var Routes = []Route{
	{"GET", "/meta", (*handlers).meta},
	{"GET", "/plan", (*handlers).plan},
	{"GET", "/projects", (*handlers).listProjects},
	{"POST", "/projects", (*handlers).createProject},
	{"GET", "/projects/{projectId}", (*handlers).getProject},
	{"GET", "/projects/{projectId}/environments", (*handlers).projectEnvironments},
	{"GET", "/projects/{projectId}/webapps", (*handlers).listWebApps},
	{"POST", "/projects/{projectId}/webapps", (*handlers).createWebApp},
	{"GET", "/projects/{projectId}/webapps/{webAppId}", (*handlers).getWebApp},
	{"GET", "/git/github/installations", (*handlers).listInstallations},
	{"POST", "/git/github/installations", (*handlers).bindInstallations},
	{"GET", "/git/github/repos", (*handlers).listRepos},
	{"GET", "/git/branches", (*handlers).listBranches},
	{"GET", "/webapps/{webAppId}/branches", (*handlers).repoBranches},
	{"GET", "/webapps/{webAppId}/tracks", (*handlers).listTracks},
	{"POST", "/webapps/{webAppId}/tracks", (*handlers).createTrack},
	{"DELETE", track, (*handlers).deleteTrack},
	{"GET", track + "/deletable", (*handlers).trackDeletable},
	{"PUT", track + "/auto-deploy", (*handlers).setAutoDeploy},
	{"GET", track + "/builds", (*handlers).listBuilds},
	{"POST", track + "/builds", (*handlers).triggerBuild},
	{"GET", track + "/builds/{buildId}/logs", (*handlers).buildLogs},
	{"GET", track + "/build-config", (*handlers).buildConfig},
	{"GET", track + "/latest-commit", (*handlers).latestCommit},
	{"GET", track + "/environments", (*handlers).environments},
	{"GET", track + "/deployments", (*handlers).deployments},
	{"POST", track + "/deployments", (*handlers).deploy},
	{"POST", track + "/deployments/promote", (*handlers).promote},
	{"POST", track + "/environments/{env}/redeploy", (*handlers).redeploy},
	{"POST", track + "/environments/{env}/stop", (*handlers).stop},
	{"GET", track + "/environments/{env}/release", (*handlers).release},
	{"GET", track + "/environments/{env}/pods", (*handlers).pods},
	{"GET", track + "/environments/{env}/pods/{pod}/events", (*handlers).podEvents},
	{"GET", track + "/environments/{env}/pods/{pod}/logs", (*handlers).podLogs},
	{"GET", track + "/environments/{env}/containers", (*handlers).containers},
	{"PUT", track + "/environments/{env}/containers/{containerId}", (*handlers).updateContainer},
	{"GET", track + "/environments/{env}/scaling", (*handlers).scaling},
	{"PUT", track + "/environments/{env}/scaling", (*handlers).updateScaling},
	{"GET", track + "/environments/{env}/replicas", (*handlers).replicas},
	{"GET", track + "/environments/{env}/health-check", (*handlers).healthCheck},
	{"PUT", track + "/environments/{env}/health-check", (*handlers).updateHealthCheck},
	{"DELETE", track + "/environments/{env}/health-check", (*handlers).deleteHealthCheck},
	{"GET", track + "/environments/{env}/metrics", (*handlers).metrics},
	{"GET", track + "/environments/{env}/usage", (*handlers).usage},
	{"GET", track + "/image", (*handlers).imageSource},
	{"POST", track + "/image/deploy", (*handlers).deployImageTag},
	{"GET", track + "/environments/{env}/configs", (*handlers).configs},
	{"POST", track + "/environments/{env}/configs", (*handlers).createConfig},
	{"PUT", track + "/environments/{env}/configs/{configId}", (*handlers).updateConfig},
	{"DELETE", track + "/environments/{env}/configs/{configId}", (*handlers).deleteConfig},
	{"POST", track + "/logs/query", (*handlers).runtimeLogs},
	{"GET", track + "/urls", (*handlers).urls},
}

// Server holds the router dependencies.
type Server struct {
	BasePath       string
	Service        *webapp.Service
	Auth           Authenticator
	Orgs           platform.OrgResolver
	CORSOrigins    []string
	RequestTimeout time.Duration
}

// Handler builds the HTTP handler.
func (s *Server) Handler() http.Handler {
	h := &handlers{svc: s.Service}
	api := http.NewServeMux()
	for _, rt := range Routes {
		rt := rt
		api.HandleFunc(rt.Method+" "+s.BasePath+rt.Path, func(w http.ResponseWriter, r *http.Request) { rt.Handle(h, w, r) })
	}
	root := http.NewServeMux()
	health := func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
	root.HandleFunc("GET /health", health)
	root.HandleFunc("GET "+s.BasePath+"/health", health)
	root.Handle("/", withAuth(s.Auth, s.Orgs, api))
	return withCORS(s.CORSOrigins, withLogging(s.RequestTimeout, root))
}

type handlers struct{ svc *webapp.Service }

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20))
	if err := dec.Decode(v); err != nil {
		badRequest(w, "invalid request body: "+err.Error())
		return false
	}
	return true
}

func respond(w http.ResponseWriter, r *http.Request, status int, v any, err error) {
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeJSON(w, status, v)
}

func ids(r *http.Request) (string, string) { return r.PathValue("webAppId"), r.PathValue("trackId") }

func (h *handlers) meta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.svc.Meta(r.Context()))
}

func (h *handlers) listProjects(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListProjects(r.Context())
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) createProject(w http.ResponseWriter, r *http.Request) {
	var in webapp.CreateProjectInput
	if !decode(w, r, &in) {
		return
	}
	v, err := h.svc.CreateProject(r.Context(), in)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) getProject(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.GetProject(r.Context(), r.PathValue("projectId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) projectEnvironments(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ProjectEnvironments(r.Context(), r.PathValue("projectId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) listWebApps(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListWebApps(r.Context(), r.PathValue("projectId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) createWebApp(w http.ResponseWriter, r *http.Request) {
	var in webapp.CreateWebAppInput
	if !decode(w, r, &in) {
		return
	}
	v, err := h.svc.CreateWebApp(r.Context(), r.PathValue("projectId"), in)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) getWebApp(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.GetWebApp(r.Context(), r.PathValue("projectId"), r.PathValue("webAppId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) listInstallations(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListInstallations(r.Context())
	respond(w, r, http.StatusOK, map[string]any{"items": v}, err)
}

func (h *handlers) bindInstallations(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	if !decode(w, r, &in) {
		return
	}
	v, err := h.svc.BindInstallations(r.Context(), in.Code)
	respond(w, r, http.StatusCreated, map[string]any{"items": v}, err)
}

func (h *handlers) listRepos(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(r.URL.Query().Get("installationId"), 10, 64)
	v, err := h.svc.ListRepos(r.Context(), id)
	respond(w, r, http.StatusOK, map[string]any{"items": v}, err)
}

func (h *handlers) listBranches(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id, _ := strconv.ParseInt(q.Get("installationId"), 10, 64)
	v, err := h.svc.ListBranches(r.Context(), q.Get("repoUrl"), id, q.Get("owner"), q.Get("repo"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) repoBranches(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.RepoBranches(r.Context(), r.PathValue("webAppId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) listTracks(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.ListTracks(r.Context(), r.PathValue("webAppId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) createTrack(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Branch string `json:"branch"`
	}
	if !decode(w, r, &in) {
		return
	}
	v, err := h.svc.CreateTrack(r.Context(), r.PathValue("webAppId"), in.Branch)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) deleteTrack(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	respond(w, r, http.StatusNoContent, nil, h.svc.DeleteTrack(r.Context(), a, t))
}

func (h *handlers) trackDeletable(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.CheckTrackDeletable(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) setAutoDeploy(w http.ResponseWriter, r *http.Request) {
	var in struct {
		AutoDeploy bool `json:"autoDeploy"`
	}
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.SetAutoDeploy(r.Context(), a, t, in.AutoDeploy)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) listBuilds(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.ListBuilds(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) triggerBuild(w http.ResponseWriter, r *http.Request) {
	var in webapp.TriggerBuildInput
	if r.ContentLength != 0 && !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.TriggerBuild(r.Context(), a, t, in.CommitSHA)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) buildLogs(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.BuildLogs(r.Context(), a, t, r.PathValue("buildId"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) buildConfig(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.BuildConfig(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) latestCommit(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.LatestCommit(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) environments(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Environments(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) deployments(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Deployments(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) deploy(w http.ResponseWriter, r *http.Request) {
	var in webapp.DeployBuildInput
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.Deploy(r.Context(), a, t, in)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) promote(w http.ResponseWriter, r *http.Request) {
	var in webapp.PromoteInput
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.Promote(r.Context(), a, t, in)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) redeploy(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Redeploy(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) stop(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Stop(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) release(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.ReleaseDetails(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) pods(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Pods(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) podEvents(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.PodEvents(r.Context(), a, t, r.PathValue("env"), r.PathValue("pod"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) podLogs(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.PodLogs(r.Context(), a, t, r.PathValue("env"), r.PathValue("pod"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) containers(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Containers(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) updateContainer(w http.ResponseWriter, r *http.Request) {
	var in webapp.ContainerUpdate
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.UpdateContainer(r.Context(), a, t, r.PathValue("env"), r.PathValue("containerId"), in)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) scaling(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Scaling(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) updateScaling(w http.ResponseWriter, r *http.Request) {
	var in webapp.ScalingConfig
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.UpdateScaling(r.Context(), a, t, r.PathValue("env"), in)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) replicas(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Replicas(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) plan(w http.ResponseWriter, r *http.Request) {
	v, err := h.svc.Plan(r.Context())
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) healthCheck(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.HealthCheck(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) updateHealthCheck(w http.ResponseWriter, r *http.Request) {
	var in webapp.HealthCheck
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.UpdateHealthCheck(r.Context(), a, t, r.PathValue("env"), in)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) deleteHealthCheck(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	respond(w, r, http.StatusNoContent, nil, h.svc.DeleteHealthCheck(r.Context(), a, t, r.PathValue("env")))
}

func (h *handlers) metrics(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Metrics(r.Context(), a, t, r.PathValue("env"), webapp.MetricsRange(r.URL.Query().Get("range")))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) usage(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Usage(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) imageSource(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.ImageSource(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) deployImageTag(w http.ResponseWriter, r *http.Request) {
	var in webapp.DeployImageInput
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.DeployImageTag(r.Context(), a, t, in)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) configs(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.Configs(r.Context(), a, t, r.PathValue("env"))
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) createConfig(w http.ResponseWriter, r *http.Request) {
	var in webapp.ConfigWrite
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.CreateConfig(r.Context(), a, t, r.PathValue("env"), in)
	respond(w, r, http.StatusCreated, v, err)
}

func (h *handlers) updateConfig(w http.ResponseWriter, r *http.Request) {
	var in webapp.ConfigWrite
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.UpdateConfig(r.Context(), a, t, r.PathValue("env"), r.PathValue("configId"), in)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) deleteConfig(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	respond(w, r, http.StatusNoContent, nil, h.svc.DeleteConfig(r.Context(), a, t, r.PathValue("env"), r.PathValue("configId")))
}

func (h *handlers) runtimeLogs(w http.ResponseWriter, r *http.Request) {
	var in webapp.LogsRequest
	if !decode(w, r, &in) {
		return
	}
	a, t := ids(r)
	v, err := h.svc.RuntimeLogs(r.Context(), a, t, in)
	respond(w, r, http.StatusOK, v, err)
}

func (h *handlers) urls(w http.ResponseWriter, r *http.Request) {
	a, t := ids(r)
	v, err := h.svc.DefaultURLs(r.Context(), a, t)
	respond(w, r, http.StatusOK, v, err)
}
