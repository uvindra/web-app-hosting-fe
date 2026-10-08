# Adaptation Notes

This app is a new, standalone front end for **WSO2 Web App Hosting**, built by reusing the
tech stack and patterns of `integration-control-plane/ipaas` (the sibling Integration Control
Plane front end on the same WSO2 Cloud platform) — cloning only what's generic (auth, theming,
app-shell, listing/search/create patterns), not anything integration/Ballerina/MI-specific.

This file has two parts:

- **[Differences from ipaas](#differences-from-ipaas)** — the standing architectural deltas.
  Update this section whenever a deviation is intentionally introduced or resolved (e.g. once a
  stub is replaced with a real backend call, move it out of here).
- **[Changelog](#changelog)** — a dated, append-only log of what changed and why. Add a new
  entry (newest on top) whenever you make a change worth remembering later — don't rewrite
  history, just append.

## Differences from ipaas

### Single product, not multi-target

ipaas builds three product variants (`wip`/`cloud`/`icp`) from one source tree via a `PRODUCT`
env var, `#api`/`#product` Vite aliases, and `IS_WIP`/`IS_CLOUD`/`IS_ICP` build-time flags. This
app has exactly one target, so all of that is gone: no `PRODUCT` env, no path aliases, one
`src/api/*.ts` per domain (not `src/api/<product>/*.ts`).

### Trimmed dependencies

Dropped everything that was integration-feature-specific or unused here: GraphQL client,
`@monaco-editor/react`, `mermaid`, `swagger-ui-react`/`@apidevtools/swagger-parser`,
`@wso2/cell-diagram`, `@modelcontextprotocol/sdk`, markdown/syntax-highlighting packages. Kept:
`react`, `react-router`, `@tanstack/react-query`, `@wso2/oxygen-ui` (+icons, +`-charts-react` for the Metrics page), and the same
Vite/TS/ESLint/Prettier/Vitest/Playwright tooling versions as ipaas.

### Simplified scope model

ipaas has a generic N-level `OrgScope`/`ProjectScope`/`ComponentScope` matrix with
`generateMatrixRoutes`/`withScope` machinery to fan the same route shape out across product
variants. This app only ever has Org → Project → WebApp (3 fixed levels), so `src/nav.ts` /
`src/paths.ts` are a plain typed scope + a flat, explicit route table
(`src/config/routes.tsx`) — no generic route-generation layer.

### Sidebar scope

Inside a web app (`hasWebApp(scope)`), the sidebar (`src/layouts/AppLayout.tsx`, items declared
in `src/nav.ts`) shows: Overview, Build, Deploy, Observe (Metrics, Runtime Logs), DevOps
(Runtime, Containers, Configs & Secrets, Health Checks, Scaling) and Settings (tabs: Deployment
Tracks, URL Settings). At org/project level it still only shows Overview. The menu is the
intersection of the choreo-console Web App menu and the generic pages ipaas already has; it
is scoped to **buildpack and BYOC web apps** (no BYOI image-only flows).

Deliberately **not** ported (choreo-console has them for web apps or ipaas has them, but they
were cut for scope or because they're Choreo/APIM/MI-specific): Connections, Insights,
Incidents, Test/Manage, Execute, Develop, API Governance, Audit Logs, CI Workflows/External CI,
Access Control (RBAC), Alerts and Storage (ipaas has no cloud backend for those either),
Authentication Keys (waiting on the auth-model design), the short-URL feature, the free-hours
quota banner and the Local Development proxy wizard. Add them back as real sections when
designed, not as empty stubs.

Ported pages were stripped of `GENERIC_SERVICE_TYPES` / `identifyIntegration` / APIM
endpoint-and-visibility drawers / subscription and BYOI gating / gateway-logs tab.

### Backend: the Web App Hosting BFF (`backend/`)

`src/api/*.ts` call the BFF (`webAppHostingClient`, base `VITE_WEBAPP_API_URL`; contract
`backend/api/openapi.yaml`) — projects, web apps, deployment tracks, builds (+ step logs),
deployments, runtime (+ usage), containers, scaling (fixed replicas and HPA), health checks, metrics,
configs/secrets/files, runtime logs, default URLs, image-sourced web apps and the org's plan
(`GET /plan`). The BFF runs against WSO2 Cloud (`TARGET=wso2cloud`) or a local OpenChoreo
(`TARGET=openchoreo`). Still a stub (its page shows "Coming soon" instead of mock data): custom
domains in `urlSettings.ts` (P2). `src/contexts/AccessControlContext.tsx` /
`src/components/Authorized.tsx` are still an **always-allow stub** (same as ICP cloud).

Unlike ipaas, every web-app page is **per deployment track**: a track is one branch, backed by one
OpenChoreo Component. The selected track lives in `?track=` (`paths.withTrack`), is resolved by
`useWebAppContext` (default: the web app's default track) and reaches the hooks as a
`TrackRef {webAppId, trackId}`; `WebAppPage` renders the track picker. Environments come from the
project's deployment pipeline (`useProjectEnvironments`), not a hardcoded list; `WebAppPage
withEnvironment` renders the environment picker.

### Plan gating (free vs paid)

The BFF reads the org's plan (billing user API on WSO2 Cloud; `LOCAL_PLAN=free|paid` locally) and
answers `403 PLAN_REQUIRED` for paid-only features: HPA, more than 1 fixed replica, container resources
above the defaults (CPU 100m, memory 350Mi / 1Gi) and deploying past the first environment. The console
reads `GET /plan` (`usePlan`) to disable those controls with an upgrade hint (`PlanUpgradeHint`, linking
to `BILLING_CONSOLE_URL` when set); `ErrorAlert` also recognises `PLAN_REQUIRED`. The plan badge and the
"Upgrade" button in the header show only when billing is configured (not locally) — ipaas'
`AppLayout` has the same badge + upgrade pattern.

### Auth: ported, but simplified to one path

`src/auth/` (`AuthContext.tsx`, `tokenManager.ts`, `authorizeUrl.ts`, `ProtectedRoute.tsx`) is
ported from ipaas (OIDC+PKCE, `/signin` callback) against the Platform IdP (ThunderID; config keys
keep the legacy `ASGARDEO_*` names). There is **no STS**, as in ICP cloud: the org comes straight
from the JWT (`organization.handle`/`ouHandle`), unless `ORG_HANDLE` is set in `config.json` — then
that wins (`tokenManager.resolveOrgHandle`). Only the local OpenChoreo target sets it (`default`, the
one namespace its BFF uses); WSO2 Cloud leaves it empty. After login the console calls the billing API
`/organization?product=web-app-hosting` (when `BILLING_API_BASE_URL` is set), which activates the
free plan; billing UI is hidden without it.

### Git sourcing

- **GitHub App** ("Continue With GitHub", WSO2 Cloud only — hidden when the BFF reports
  `gitHubApp: false`): the popup + `BroadcastChannel` flow is ported from ipaas; the BFF exchanges the
  code with git-app-service (`/git/github/installations`), then the configure page shows live
  installation → repository → branch pickers. A 409 opens the App install page.
- **Public GitHub repositories**: URL paste plus a live branch picker.
- Other providers (Bitbucket/GitLab/Azure DevOps) are hidden for now (private non-GitHub repos are P2).
- **Container image import** ("Container Registry"): public images only — image + tag + port; private
  registries aren't supported (no credential fields). Image web apps have no builds and a single track;
  the Build page shows the image with a "Deploy tag" action.
- **Build Preset selector** (12 presets, `src/pages/CreateWebAppForm.tsx`) is net-new. The BFF maps
  React/Angular/Vue/Static to its SPA workflow (nginx-unprivileged on 8080, so the port field is fixed
  for them), language presets to Paketo and Docker to the Dockerfile builder. Preset logos
  (`src/assets/build-presets/*.svg`) come from `choreo-console`'s buildpack picker; none are
  theme-aware, so each renders inside a small white rounded badge.

### Samples: hardcoded manifest, not a remote JSON fetch

ipaas's samples gallery fetches a JSON manifest from an external URL at runtime
(`useSamples`/`window.API_CONFIG.samplesUrl`). This app hardcodes the 4 known samples directly
in `src/mock-data/samples.ts` (React/Vue/Angular/Go, all from `wso2/choreo-samples`) since
there's no equivalent manifest published for Web App Hosting yet. "Quick deploy" turns a sample
into a public-Git create request (`utils/sampleInput.ts`). Switch `src/api/samples.ts` to a real
fetch once a manifest exists.

### Overview page: no plugin registry

ipaas's component-overview page is a per-integration-type plugin registry
(`Overview/registry.ts` + a shell/plugin architecture) because it renders differently per
integration type. This app only has one resource type (a web app), so
`src/pages/WebAppOverview.tsx` is one flat component (header + `Latest Build` card +
one card per pipeline environment) — no registry, no plugin indirection.

### Dev-only helpers (don't exist in ipaas at all)

- `pnpm dev:local` (Vite mode `openchoreo`) runs the console against a local OpenChoreo on k3d: it
  serves `public/config.local.json` as `/config.json` and proxies the BFF (`/__bff`) and ThunderID
  (`/__thunder`) so neither needs CORS. See the repo `README.md`.
- `AuthContext.devLogin()` + `src/pages/DevSeedSession.tsx` seed a fake session without an IdP
  (`/dev-login`, registered only under `import.meta.env.DEV`; `pnpm demo`). Pair it with the BFF in
  `AUTH_MODE=dev` (local only), which then uses its own client for every platform call.

## Changelog

### 2026-10-08 — Fixes from the P1 browser walkthrough

- **Config editor dropped keystrokes / "Maximum update depth exceeded".** Typing fast into the Configs & Secrets
  editor (seen with the File `config.js` content; the name, key and value inputs too) lost a character roughly every
  50 keystrokes, with React's update-depth error thrown from `setEntry`. Cause: in development MUI's `FormControl`
  rebuilds its context on every render (its dev-only `registerEffect` isn't memoised), so every TextField that
  re-renders re-runs `InputBase`'s `setAdornedStart` effect, leaving a pending update. Each keystroke re-rendered
  *every* field of the form, and when input outpaces React's non-urgent work (Chrome runs queued input first:
  automated typing, fast typists) those updates chain across keystrokes until React's nested-update counter passes
  50 and throws from the next `setState`, discarding that keystroke. Not our state logic, and production builds
  aren't affected, but dev (and every browser walkthrough) is. Fix: `ConfigEditor` uses the new
  `components/MemoTextField` (`memo(TextField)`) with stable `useCallback` handlers (functional `setForm` only) and
  hoisted `sx`/`slotProps`, and each key/value row is a memoised `EntryRow` — typing now re-renders only the field
  being edited. Covered by `ConfigEditor.test.tsx` (fails on the old code), which types >100 characters with `/`
  without yielding. `vitest.config.ts` now inlines `@wso2/oxygen-ui` (and `@mui/x-*`) so component tests can render
  oxygen-ui (its ESM build imports `prismjs/components/*` without extensions, which Node rejects). Other forms with
  several controlled TextFields have the same dev-only exposure; use `MemoTextField` there if it bites.

### 2026-10-08 — P1: health checks, HPA, container images, metrics, plan gating

- **Health Checks page** is live (per track + environment, behind `DeployedGate`): liveness/readiness probes
  (HTTP GET with headers, TCP, exec) via `GET/PUT …/environments/{env}/health-check`. Unset readiness = the
  platform's default TCP check on the web app's port (shown on the card); the probe form prefills the web app's
  port, which is the only one the BFF accepts. Saving restarts the environment's pods.
- **Scaling: HPA** is selectable (min/max ≤ 5, CPU and/or memory utilization targets 10–100%), backed by the
  BFF's own `web-app-hosting-hpa` trait; HPA settings are kept while autoscaling is off. Free plans see HPA
  disabled ("Paid plans") and replicas capped at 1, with an upgrade hint.
- **Metrics page** is live (ranges 30m / 1h / 6h / 24h): CPU and memory are totals across the environment's
  replicas. The Observer reports p50/p90/p99 latency (no p95) and failed vs successful requests (no 4xx/5xx
  split), so the latency series are p50/p90/p99 and the error chart is one "failed requests %" series. When the
  platform has no HTTP metrics for the web app (`httpAvailable: false` — e.g. local k3d, no HTTP metric source)
  the request/latency/error charts are hidden with a note. Rows come with an RFC 3339 `time`; `api/metrics.ts`
  labels them in the viewer's local time. The mock generator (`mock-data/metrics.ts`, `seededRandom`, …) and
  the health-check mocks are gone.
- **Runtime/Scaling usage is real:** the Runtime cards use `GET …/usage` (latest totals across pods); per-pod
  and per-replica usage is filled only when the environment runs a single pod (the platform reports totals).
- **Container images:** the "Container Registry" create option is enabled — image (no tag) + tag + port, public
  images only, with a note on the security profile (UID 65534, read-only FS, only `/tmp` writable). The registry
  type selector and the free-text credential reference are removed. The BFF deploys the image to the first
  environment on create; Build and Deploy pages show the image with "Deploy tag"; Overview shows the image
  instead of a source link and no build card; Deployment Tracks hides "Create" (one track per image app);
  deployment summaries show the deployed image.
- **Plan gating:** see "Plan gating" above. Containers caps the sliders at the defaults on free plans; Deploy
  disables promotion past the plan's environments.
- Removed the "Coming soon" gates for health checks, metrics, HPA and Docker import.
- BFF (same branch): CT v3 + HPA trait, release re-cut for pre-v3 releases, image-sourced tracks, metrics,
  plan lookup; see `backend/api/openapi.yaml`.


### 2026-10-08 — Code-review fixes (deploy races, configs, logs paging, track naming)

- **Deploys are serialized per track (BFF).** A release is cut by writing the build's workload onto the track's single
  Workload and snapshotting it, so concurrent deploys of one track could cut a release holding another build's image.
  `deployRun` now holds a per-track lock, the release's frozen image is checked against the build's after
  `GenerateRelease` (mismatch → delete + re-cut, then 409), and an existing release is reused only when its image
  matches (unbound mismatch → re-cut; bound → 409). The lock is process-local: with several BFF replicas the image
  check is the backstop.
- **Auto-deploy picks the newest build.** Watchers and `ListBuilds` request one coalesced pass per track (under the
  same lock) that deploys only the newest finished successful pending build; older ones become `superseded`, failed
  ones `done`, and a build older than an already auto-deployed one is never deployed.
- **File configs:** a file config may not mount a file another file config already mounts at the same path (409, also
  on update); deleting a config removes only its own entries.
- **Track delete** also deletes the secret-store entries of the track's secret configs (best-effort, logged).
- **Runtime-log paging:** the Observer filters `startTime`/`endTime` exclusively at second precision and returns
  second-precision timestamps, so "Load more" (`end = cursor − 1s`) skipped lines. The cursor is now opaque (last
  timestamp + keys of the already-returned lines within a second of it); the next page widens the window and de-dupes.
- **Track naming:** new branch tracks are `<handle>--<branch-slug>`; new web-app handles can't contain `--`, so track
  and web-app Component names can't collide. `Slug` keeps case-only branch differences apart. Existing
  `<handle>-<slug>` tracks keep working (names are opaque IDs).
- **Build logs:** step logs are read concurrently (≤4); the drawer refetches when the open build finishes and re-reads
  the (lagging) archived logs for a minute after.
- **Stale `?track=`:** an unknown track (stale link, or the selected track just deleted) falls back to the default
  track and the URL is replaced without `?track=` (`paths.withoutTrack`).
- **CLAUDE.md `?? ''`:** removed the instances this branch added (hooks take `string | undefined` + `skipToken`;
  explicit guards in the config editor/list and create form; WebAppPage shows a "No environments" state).

### 2026-10-08 — Minor fixes from the P0 browser walkthrough

- **Project home count:** the subtitle said "N web applications deployed" for every web app. It now reads
  "2 web applications · 1 deployed" (`utils/webAppSummary`; deployed = status other than `not-deployed`, which the BFF
  derives from the pipeline's first environment).
- **Track list after delete:** OpenChoreo deletes Components asynchronously, so the refetch still returned the track.
  - BFF: track lists, web app lists/counts and track lookups skip Components with a `deletionTimestamp`.
  - Console: `useDeleteDeploymentTrack` removes the track from the cached list before the refetch (`useCreateDeploymentTrack`
    adds the created one). `TrackDeleteButton` awaits `mutateAsync`: per-call `mutate` callbacks don't fire once the
    row unmounts, which would lose the success alert.
- **Pods table clipped:** Logs/Events are now icon buttons with tooltips, pod names wrap at a smaller min width and the
  table scrolls inside its container (Scaling's replicas table too).
- **No fake zero usage (metrics are P1):** the BFF sent 0 for pod CPU/memory usage.
  - `Pod.cpuUsageMillicores`/`memoryUsageBytes` and `ReplicaPod.cpuUsage`/`memoryUsageMb` are optional end to end
    (absent = not available, for P1 to fill). `Pod` gained `cpuRequestMillicores`/`memoryRequestBytes`.
  - Runtime cards show "Request 0.10 vCPU · Limit 0.10 vCPU" / "Request 350 MiB · Limit 1 GiB" with "Usage metrics
    coming soon"; per-pod and per-replica usage cells show "—". `formatBytes` drops trailing zeros ("350 MiB").
- **Org label:** locally the header and URLs showed the user's JWT `ouHandle` while the BFF uses the `default` namespace.
  A configured `ORG_HANDLE` now wins over the JWT org (see Auth above). Older sessions: the root and post-login
  redirects use `getSessionOrgHandle`, saved redirect paths and `ProtectedRoute` move `/organizations/<other>/…` onto
  the configured org (`paths.withOrg`). The synthetic-`default` guard in `saveRedirectUrl` is unchanged. Tests:
  `auth/orgHandle.test.ts`, `auth/redirectUrl.test.ts`.
- **Docker paths:** the Build page showed the Dockerfile path and build context from the repository root, while create
  takes them relative to the component directory. The BFF's `BuildConfig.docker` now converts the workflow's repo-root
  paths back (`relToAppPath`), so create input and build-config output match (OpenAPI `DockerBuild` updated). The panel
  labels them "(from component directory)", next to Component Directory.
- **`.gitignore`:** the bare `build/` rule also ignored `src/components/build/`, so its five components were never
  committed (a fresh clone wouldn't compile). The rule is now anchored (`/build/`, `/frontend/build/`) and the files are tracked.

### 2026-10-08 — Fixes from the P0 browser walkthrough

- **Branch lookup / GitHub rate limit:** the create form looked up branches on every keystroke of the repo URL
  (mostly 404s), which used up the unauthenticated GitHub limit (60/h) and caused 403s elsewhere.
  - Lookups now wait for a complete `https://github.com/<owner>/<repo>` (`utils/parseGitHubUrl.normalizeGitHubRepoUrl`)
    and a 500ms pause (`hooks/useDebouncedValue`); `useBranches` keys on the normalized URL and keeps results for 60s.
  - BFF: public GitHub reads (branches, latest commit, 404s too) are cached for 60s per request path, with concurrent
    identical reads sharing one call; builds read the branch head fresh (`platform.WithFreshReads`). GitHub rate limits
    map to `429 GIT_RATE_LIMITED` (message says when it resets), not a bare 403. Upstream timeouts map to `504 UPSTREAM_TIMEOUT`.
  - Build page: the Latest Commit card degrades on its own ("Couldn't load the latest commit" + Retry; Build Latest
    then builds the branch head) instead of failing the whole page.
- **BFF list endpoints (N+1):** `GET /projects/{p}/webapps` read one ReleaseBinding list per web app and
  `GET /webapps/{w}/tracks` one per track, all sequentially, after 3 sequential pipeline reads.
  - List endpoints now read components, environments and the namespace's release bindings once each, concurrently
    (`errgroup`), and join in memory: `/webapps` = 5 upstream GETs, `/projects` = 2, `/tracks` = 2, whatever the item
    count (`TestListCallsAreConstant` counts calls on a fake upstream).
  - Pipeline environments (environment list + project + pipeline, read concurrently) are cached for 30s
    (`Options.EnvCacheTTL`). Track pages (builds, deployments, environments, URLs, runtime) read the track, its bindings
    and runs concurrently. Existence checks no longer list every component for a web app count.
  - Release-binding lists now follow pagination.
- **Slow track / web app create (~22s, 500 after ~40s under load):** `POST /webapps/{w}/tracks` listed every branch
  from GitHub, created the Component, then synchronously started the first build (another GitHub read, build
  credentials, WorkflowRun create), each OC call allowed 4 x 30s attempts.
  - Both creates now answer 201 as soon as the Component exists; the first build starts in the background
    (`Service.firstBuild`, detached service identity, 2 min bound). Web app create runs its pre-checks (project,
    name free, platform resources) concurrently.
  - The track's branch check uses the cached branch list and is skipped (logged) when GitHub is unavailable or
    rate-limited, instead of failing the create.
  - OpenChoreo retries: 3 attempts x 15s (was 4 x 30s, past the 60s request timeout); 504 is no longer retried
    for writes. A timeout answers `504 UPSTREAM_TIMEOUT` with a readable message.
  - Console: the create-track dialog shows the BFF's message for branch-list failures and says the first build is
    starting; branch lists are kept for 60s and not retried on 429.
- **Preset form fields:** Static Site and Docker showed Build Command / Build Path / Node Version with React defaults,
  and buildpack presets were prefilled with `npm run build` / `/build`, none of which the BFF used.
  - `constants/buildPresets.ts` now has `presetKind` (spa | static | docker | buildpack), `presetDefaults` and
    `toBuildInput` (only what the BFF consumes): SPA → build command, output dir, Node version; Static → "Directory
    to serve" (default `/`), no build; Docker → Dockerfile path (default `Dockerfile`) + build context (default `.`),
    both relative to the component directory, + port; buildpack → port (+ optional Node version for NodeJS).
    Picking a preset resets the fields to its defaults. The Build page's config panel shows the same per-preset fields.
  - BFF: `CreateWebAppInput.docker {filePath, context}` (OpenAPI `DockerBuild`) feeds the dockerfile-builder's
    `docker.filePath` / `docker.context` (resolved against the component directory, rejected if outside the repo);
    `BuildConfig.docker` reports them; static build configs no longer report a Node version.
- **Readiness probe (ComponentType v2):** pods reported Ready before the app listened, so the gateway answered 503
  "connection refused" for a few seconds after each rollout (seen with a NodeJS/Paketo app).
  - `deployment/web-app-hosting` now renders a TCP readiness probe on the workload's first endpoint port
    (initialDelay 2s, period 5s, timeout 2s, failureThreshold 3); no liveness probe. The timings live in
    `environmentConfigs.readinessProbe` so P1 health checks can extend that one object instead of adding a second probe.
  - `platformres.Version` is 2, so each org's ComponentType (and SPA workflow) is upgraded on its next web-app create.
  - Checked on k3d (OpenChoreo 1.3.0): a NodeJS sample deployed with the probe and a rolling restart served no 503s.
- **Quick Deploy from samples failed silently:** the project page sent `sourceType: 'sample'`, which `api/webApps.ts`
  rejected before any request, and the handler had no `catch`.
  - Every sample entry point (project page, create options, import options) now uses `useCreateSampleWebApp`:
    `utils/sampleInput.createFromSample` maps the sample to a public-Git create (`sampleToInput`, build fields via
    `toBuildInput`) and, on a 409 name collision (the sample was deployed before), retries with a short random
    suffix (`react-spa-x7k2`); pages navigate to the returned handle. Errors, including 402 quota, show in an
    `ErrorAlert`. The `sample` source type is gone from `CreateWebAppInput`.
  - Samples (checked against `wso2/choreo-samples@main`): React `/build`, Vue `/dist`, Angular `/dist/angular-spa`
    (from its angular.json; was `/dist`), all Node 18; Go via the Go buildpack on 8080 with no build command.
- **Stale scale-to-zero text:** removed "Scale to zero is enabled …" from the Deploy page's environment cards
  (`DeployEnvironmentCard`); scale-to-zero was dropped (D6, see 2026-10-06).

### 2026-10-08 — Fix post-login redirect

- **Full URL saved:** `ProtectedRoute` saved the full `window.location.href` as the page to return to after sign-in. `SignIn` then passed it to react-router's `navigate`, which expects an in-app path. Deep links didn't restore after login.
  - `saveRedirectUrl` now stores `/path?query#hash`, same-origin only.
  - `getAndClearRedirectUrl` only returns same-app paths.
- **Local org skipped:** the ipaas-inherited guard that skips the synthetic `default` org now steps aside when `default` is the configured org (`ORG_HANDLE=default`, the local OpenChoreo target).
- Test: `src/auth/redirectUrl.test.ts`.

### 2026-10-07 — P0: wired to the BFF

- **Why:** the Web App Hosting BFF (`backend/`) exists now; P0 makes the core loop real.
- **API:** all `src/api/*.ts` except `healthChecks`, `metrics`, `samples` and the custom-domain half of
  `urlSettings` call the BFF (`api/trackPath.ts` builds track paths). New `api/meta.ts`, `api/git.ts`,
  `api/billing.ts`; `fetchBuildLogs` loads a build's step logs on demand. BFF `{code, message}` errors
  become `HttpError.code`; `isQuotaExceeded` + `components/ErrorAlert` show "Quota reached — upgrade"
  (link: `BILLING_CONSOLE_URL`) on web-app, track and sample create.
- **Tracks:** hooks take a `TrackRef` (query keys include the track); `useWebAppContext` reads `?track=`;
  `WebAppPage`, Overview and URL Settings render `components/webapp/TrackSelect`; the sidebar keeps the track.
- **Environments:** from the project pipeline (`useProjectEnvironments`); `constants/environments.ts` is now
  `environmentLabel`; `EnvironmentId` is a string.
- **Polling (as ICP):** builds 5s while running / 15s idle; deployments and environments 8s while deploying /
  15s idle (auto-deploys land in the background); runtime 15s.
- **Configs:** new `file` kind (one file + mount directory; SPA apps default to `/usr/share/nginx/html`, e.g. `config.js`).
- **Coming soon / disabled:** Health Checks, Metrics, custom domains, HPA, Docker import, container
  command/args editing, non-GitHub providers.
- **Auth:** STS removed (`switchOrgToken`, STS config keys); `ORG_HANDLE` fallback; refresh-token revocation at the
  IdP (`ASGARDEO_REVOKE_ENDPOINT`); first-login billing activation + plan badge.
- **Local:** `pnpm dev:local` + `public/config.local.json`. Console `Dockerfile` (nginx on 3000, from ICP).
- Removed dead mock data (`mock-data/{builds,configs,containers,deploymentTracks,logs,orgs,projects,runtime,scaling,webApps}.ts`)
  and `components/urlSettings/DomainDialog.tsx` (P2).

### 2026-10-07 — Monorepo layout

- **Why:** the repo is now a monorepo for the FE and its BFF, since the backend is a BFF for this front end.
- **Moves:**
  - All front-end code and config moved into `frontend/` with `git mv`, so history is kept: `src/`, `public/`, `package.json`, the lockfile, `pnpm-workspace.yaml`, the TS/Vite/Vitest/ESLint/Prettier configs and `index.html`.
  - `backend/` was added for the Go BFF; it's empty, with a `.gitkeep`.
  - The Markdown docs (`CLAUDE.md`, this file) and `.gitignore` stay at the repo root.
- **Paths:** paths in this file are relative to `frontend/` unless stated otherwise. `pnpm` commands run from `frontend/`.
- The repo may be renamed later.

### 2026-10-06 — Metrics: removed the 7-day range

- Dropped `'7d'` from `MetricsRange` / `METRICS_RANGES` and `RANGE_CONFIG`. Prometheus on the WSO2 Cloud observability plane keeps metrics for 3 days by default (`prometheus_metrics_retention_time`), so a 7-day window would be mostly empty. The longest range is now 24 hours.
- `bucketLabel` no longer takes a range, since every window is at most a day and shows only the time of day. Its test was updated to match.
- Runtime Logs keeps its "Past 7 days" filter, because logs are retained separately.

### 2026-10-06 — Scaling: removed scale-to-zero; Deployment Tracks: branch picker

- **Decision:** scale-to-zero is off the Scaling page for now. It needs KEDA on the WSO2 Cloud data plane, which changes the data plane's deployment architecture, so it's deferred. Scaling now offers only HPA and No Autoscaling (fixed replicas).
- **Code changes:**
  - Deleted `components/scaling/ScaleToZeroConfig.tsx`.
  - Dropped `ScalingMethod.ScaleToZero` and `ScaleToZeroSettings` from `types/scaling.ts`, along with the "Recommended" scale-to-zero card and `MAX_TARGET_PENDING_REQUESTS`.
  - Removed the "scaled to zero" empty-state text in `ReplicasTable`.
- **New default:** No Autoscaling with 1 replica (`mock-data/scaling.ts`), matching the OpenChoreo web-application default.
- **Deployment tracks:** a track is now identified only by its branch. A web app can have many tracks, each built and deployed from one branch of its repo.
  - Removed the Track Name field and column (`DeploymentTrack.name`, `CreateDeploymentTrackInput.name`).
  - `CreateTrackDialog` replaces free-text entry with a branch picker. It lists the repo's branches and leaves out branches that already have a track.
  - New stub `fetchRepoBranches` / `useRepoBranches`, backed by `MOCK_REPO_BRANCHES` / `DEFAULT_REPO_BRANCHES` in `mock-data/deploymentTracks.ts`. The real backend reads branches from the Git provider (`git-app-service`'s `/git/github/branches` for GitHub-App repos).
  - Delete and auto-deploy labels now name the branch.

### 2026-09-29 — Web App sidebar pages (single commit)

Extended the Web App detail page's left menu beyond Overview, porting generic pages from ipaas
and shaping them to choreo-console's Web App scope (see [Sidebar scope](#sidebar-scope)).

- **Nav plumbing:** `paths.ts` builders for every page; `nav.ts` has the sidebar item table
  and `resolveWebAppNavId` (active item from the pathname); `routes.tsx` registers the routes
  (`/settings` redirects to the first tab); `AppLayout` renders the Web App sidebar only in a
  web-app scope. Shared frame `components/webapp/WebAppPage.tsx` + `useWebAppContext` (org →
  project → web app lookup with loading/not-found), `EnvironmentSelect`, `constants/environments`.
- **Pages:** Build (commit card, history + logs drawer, read-only build config, trigger),
  Deploy (build area → Development → Production cards, URL row, promote/redeploy/stop, history),
  Overview (env cards now show URL/build and link to Build/Deploy), Metrics (charts), Runtime
  Logs (filters, load-more), Runtime (pods, events, logs, redeploy), Containers, Configs &
  Secrets, Health Checks, Scaling (scale-to-zero first), Settings → Deployment Tracks and URL
  Settings (custom domains + DNS verify).
- **Stubs (all new `api/*.ts` follow the existing pattern):** in-memory stores per web app id
  (and environment where relevant), `delay(200)`, defaults so any web app renders. Build
  config is mocked per web app (`MOCK_BUILD_CONFIGS`), not read from creation input;
  deployment track is treated as the git branch; build/deploy completion is simulated with
  `setTimeout` in the API stub.
- **Deployments store is the source of truth for environments:** `api/deployments.ts`
  (`environmentsFromStore`) now backs `fetchEnvironments` and Scaling's replica lookup, so
  Deploy, Overview and the per-environment pages agree. Removed the now-dead
  `mock-data/environments.ts`.
- **Deps:** added `@wso2/oxygen-ui-charts-react` (same ^0.8.0 as ipaas).
- **Browser check (dark + light):** walked every page in `pnpm demo`. Fixed what it turned up:
  sidebar groups now open around the active page (`webAppNavGroupOf`; an explicit user toggle
  still wins), Latency p50 no longer shares the primary orange with p95, Runtime's release
  fields no longer clip the port, and URL Settings' default URLs/CNAME now come from the same
  `buildWebAppHost` as Deploy so the web app URL is consistent everywhere.
- **Tidy-up:** all web-app pages share one content width (`WEB_APP_PAGE_MAX_WIDTH`, 1100px —
  Overview, Metrics and Logs no longer differ). The Build page's latest commit now reads the web
  app's own `latestCommit` (same as Overview), so commit/build timestamps agree; apps without
  one fall back to a commit dated just before their newest build.

### 2026-09-28 — Build Preset logos

- Replaced the generic `Code` icon every Build Preset chip used with the framework/language's
  real logo, matching the wireframe. Extracted 12 SVGs from `choreo-console`'s buildpack picker
  (`src/components/ChoreoSystem/Images/ComponentTemplates/`, `.NET` from `public/images/buildpacks/`)
  into `src/assets/build-presets/`, imported as URLs (Vite's default `*.svg` handling, no SVGR
  needed) in `src/pages/CreateWebAppForm.tsx`. Wrapped each in a small white rounded badge since
  the source SVGs aren't theme-aware — see the [Build Preset selector](#gitdocker-sourcing-some-stubbed-some-net-new)
  note above.

### 2026-09-28 — Initial build

- Bootstrapped the repo (Vite + React 19 + TS, ESLint9 flat + Prettier, Vitest + Playwright)
  matching ipaas's config, trimmed to a single product (see [Differences](#single-product-not-multi-target)).
- Built core infra: auth (`src/auth/`), theming (`OxygenUIThemeProvider` + `AcrylicOrangeTheme`),
  stubbed API/hooks layer (`src/api/`, `src/hooks/`, `src/mock-data/`), simplified
  Org→Project→WebApp scope/routing (`src/nav.ts`, `src/paths.ts`, `src/config/routes.tsx`),
  app shell with org/project switcher (`src/layouts/AppLayout.tsx`), always-allow
  `AccessControlContext` stub.
- Built the wireframed pages: Projects home + Create Project (`src/pages/Projects.tsx`,
  `CreateProject.tsx`), Web App listing with samples row (`WebApps.tsx`), the create wizard
  (`CreateWebAppOptions.tsx`, `ImportWebAppOptions.tsx`, `GitHubAuthCallback.tsx`,
  `CreateWebAppForm.tsx`), the creation loader (`src/components/WebAppCreationLoader.tsx`), and
  the post-creation overview (`WebAppOverview.tsx`).
- Fixed two bugs found while manually driving the app in a browser:
  - `src/index.css` still had Vite's default single-page-app centering rule
    (`body { display: flex; place-items: center }`), which shrank the whole app to a ~700px
    column instead of filling the viewport. Removed.
  - `src/api/webApps.ts`'s `toDomain()` double-prefixed a pasted repo URL with
    `https://github.com/` when it didn't match the strict `org/repo` parser and fell back to
    storing the whole URL — fixed to detect an already-full URL and not re-prefix it.
- Added the dev-only demo helper (`AuthContext.devLogin`, `DevSeedSession.tsx`, `/dev-login`
  route, `pnpm demo` script) — see [Dev-only demo helper](#dev-only-demo-helper-doesnt-exist-in-ipaas-at-all).
