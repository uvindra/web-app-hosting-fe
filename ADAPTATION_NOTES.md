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
`react`, `react-router`, `@tanstack/react-query`, `@wso2/oxygen-ui` (+icons), and the same
Vite/TS/ESLint/Prettier/Vitest/Playwright tooling versions as ipaas.

### Simplified scope model

ipaas has a generic N-level `OrgScope`/`ProjectScope`/`ComponentScope` matrix with
`generateMatrixRoutes`/`withScope` machinery to fan the same route shape out across product
variants. This app only ever has Org → Project → WebApp (3 fixed levels), so `src/nav.ts` /
`src/paths.ts` are a plain typed scope + a flat, explicit route table
(`src/config/routes.tsx`) — no generic route-generation layer.

### Sidebar scope

ipaas's `AppLayout` sidebar has many sections (Build, Deploy, Observe, Domains, Settings, etc.).
This app's sidebar (`src/layouts/AppLayout.tsx`) has **only "Overview"** — the other sections
aren't in the wireframes and were deliberately left out entirely (no placeholder pages either),
per an explicit decision during planning. Add them back as real sections when they're designed,
not as empty stubs.

### Backend doesn't exist yet — everything is stubbed

The Web App Hosting backend hasn't been built. `src/api/{orgs,projects,webApps,builds,samples}.ts`
resolve from `src/mock-data/*.ts` after an artificial delay, with function signatures written to
match what a real REST client will look like — swapping in real `httpClient` calls later should
be a small diff per file, not a rewrite. `src/contexts/AccessControlContext.tsx` /
`src/components/Authorized.tsx` are an **always-allow stub** (no real permission model exists
yet either) — `src/auth/ProtectedRoute.tsx` only checks for a session, not permissions.

**When the real backend lands**, replace the bodies of the `src/api/*.ts` files one at a time,
keep the `src/hooks/*.ts` TanStack Query layer as-is (it already wraps `api/`, nothing above it
needs to change), and update this note.

### Auth: ported, but simplified to one path

`src/auth/` (`AuthContext.tsx`, `tokenManager.ts`, `authorizeUrl.ts`, `ProtectedRoute.tsx`) is
ported from ipaas near-verbatim (OIDC+PKCE, `/signin` callback, STS org-scoped token exchange,
`switchOrgToken`), but always follows the simpler "org context comes straight from the JWT"
path (`organization.handle`/`ouHandle` claims) rather than ipaas's dual wip-vs-cloud branching.

### Git/Docker sourcing: some stubbed, some net-new

- **GitHub OAuth** ("Continue With GitHub"): the popup + `BroadcastChannel` flow is ported from
  ipaas, but there's no backend to exchange the OAuth code for a token, so it's explicitly
  stubbed — once a code is captured, the UI just switches from a URL-paste field to plain text
  org/repo inputs (not live GitHub-API-backed pickers). See `src/pages/ImportWebAppOptions.tsx`
  and `src/pages/GitHubAuthCallback.tsx`.
- **Other providers** (Bitbucket/GitLab/Azure DevOps): ipaas has a stored-credential picker
  backed by a credentials backend. This app doesn't have that backend, so these providers reuse
  the same public-URL-paste flow as "Use Public GitHub Repository" instead.
- **Docker/container image import**: ipaas has **no** creation-time Docker source at all (only a
  post-creation bring-your-own-image flow). This is net-new for Web App Hosting —
  `src/pages/CreateWebAppForm.tsx`'s docker branch (registry type, image, tag, free-text
  credential reference — no real credential picker backend yet either).
- **Build Preset selector** (12 presets — Node/React/Angular/.NET/Vue/Python/Go/Ruby/PHP/Spring
  Boot/Static/Docker — in `src/pages/CreateWebAppForm.tsx`): also net-new. ipaas only has
  Ballerina/MI technology auto-detection, nothing like a general framework preset picker. Each
  preset's logo (`src/assets/build-presets/*.svg`) was extracted not from ipaas but from a
  third repo, `choreo-console` (the legacy WSO2 IDP UI)'s buildpack picker
  (`ComponentTemplates/`, plus `dotnet.svg` from its `public/images/buildpacks/`) — none are
  theme-aware (hardcoded brand-color fills, no dark variant), so each renders inside a small
  white rounded badge in the chip for contrast rather than bare on the dark background.

### Samples: hardcoded manifest, not a remote JSON fetch

ipaas's samples gallery fetches a JSON manifest from an external URL at runtime
(`useSamples`/`window.API_CONFIG.samplesUrl`). This app hardcodes the 4 known samples directly
in `src/mock-data/samples.ts` (React/Vue/Angular/Go, all from `wso2/choreo-samples`) since
there's no equivalent manifest published for Web App Hosting yet. Switch `src/api/samples.ts`
to a real fetch once one exists.

### Overview page: no plugin registry

ipaas's component-overview page is a per-integration-type plugin registry
(`Overview/registry.ts` + a shell/plugin architecture) because it renders differently per
integration type. This app only has one resource type (a web app), so
`src/pages/WebAppOverview.tsx` is one flat component (header + `Latest Build` card +
Development/Production environment cards) — no registry, no plugin indirection.

### Dev-only demo helper (doesn't exist in ipaas at all)

Since there's no real WSO2 Identity Platform tenant configured for this app yet
(`public/config.json`'s Asgardeo/GitHub values are placeholders), `AuthContext.devLogin()` +
`src/pages/DevSeedSession.tsx` seed a fake local session so the app can be demoed without a real
IdP. The `/dev-login` route is registered only inside `import.meta.env.DEV` (confirmed stripped
from production builds) and `pnpm demo` (`vite --open /dev-login`) launches straight into it.
ipaas has no equivalent — it always requires its real dev IdP.

## Changelog

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
