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
deployments, runtime, containers, fixed-replica scaling, configs/secrets/files, runtime logs and
default URLs. The BFF runs against WSO2 Cloud (`TARGET=wso2cloud`) or a local OpenChoreo
(`TARGET=openchoreo`). Still stubs (their pages show "Coming soon" instead of mock data):
`healthChecks.ts`, `metrics.ts` (P1) and custom domains in `urlSettings.ts` (P2); HPA and Docker
image import are visible but disabled (P1). `src/contexts/AccessControlContext.tsx` /
`src/components/Authorized.tsx` are still an **always-allow stub** (same as ICP cloud).

Unlike ipaas, every web-app page is **per deployment track**: a track is one branch, backed by one
OpenChoreo Component. The selected track lives in `?track=` (`paths.withTrack`), is resolved by
`useWebAppContext` (default: the web app's default track) and reaches the hooks as a
`TrackRef {webAppId, trackId}`; `WebAppPage` renders the track picker. Environments come from the
project's deployment pipeline (`useProjectEnvironments`), not a hardcoded list; `WebAppPage
withEnvironment` renders the environment picker.

### Auth: ported, but simplified to one path

`src/auth/` (`AuthContext.tsx`, `tokenManager.ts`, `authorizeUrl.ts`, `ProtectedRoute.tsx`) is
ported from ipaas (OIDC+PKCE, `/signin` callback) against the Platform IdP (ThunderID; config keys
keep the legacy `ASGARDEO_*` names). There is **no STS**, as in ICP cloud: the org comes straight
from the JWT (`organization.handle`/`ouHandle`), falling back to `ORG_HANDLE` in `config.json`
(local OpenChoreo tokens carry no org claims). After login the console calls the billing API
`/organization?product=web-app-hosting` (when `BILLING_API_BASE_URL` is set), which activates the
free plan; billing UI is hidden without it.

### Git sourcing

- **GitHub App** ("Continue With GitHub", WSO2 Cloud only — hidden when the BFF reports
  `gitHubApp: false`): the popup + `BroadcastChannel` flow is ported from ipaas; the BFF exchanges the
  code with git-app-service (`/git/github/installations`), then the configure page shows live
  installation → repository → branch pickers. A 409 opens the App install page.
- **Public GitHub repositories**: URL paste plus a live branch picker.
- Other providers (Bitbucket/GitLab/Azure DevOps) are hidden for now (private non-GitHub repos are P2).
- **Docker/container image import**: visible but disabled (P1).
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
