# CLAUDE.md

Project-specific instructions for working in this repo. These supplement, not replace, any
global `~/.claude/CLAUDE.md` instructions.

## What this is

A new, standalone front end for **WSO2 Web App Hosting**, built from a set of wireframes by
reusing the tech stack and patterns of `integration-control-plane/ipaas` (a sibling WSO2 Cloud
product front end) — cloning only what's generic, not anything integration/Ballerina/MI-specific.

## Repo layout (monorepo)

| Path | Contents |
|---|---|
| `frontend/` | The React app: `package.json`, `src/`, `public/`, configs. |
| `backend/` | The Web App Hosting BFF (Go): `cmd/webapp-service`, contract `api/openapi.yaml`. Gates: `go build ./... && go vet ./... && go test ./...`. |
| Root | Shared docs: this file, `ADAPTATION_NOTES.md`. |

- Unless stated otherwise, every `src/...`, `public/...` and config path in this file and in `ADAPTATION_NOTES.md` is relative to `frontend/`.
- Run all `pnpm` commands from `frontend/`.

**Read `ADAPTATION_NOTES.md` first** for the actual current state of the app: what deliberately
differs from ipaas, what's stubbed pending a real backend, and a dated changelog of what's been
built. It is the living source of truth — this file is not.

## Keep ADAPTATION_NOTES.md current — every change

Whenever you make a change to this repo (new feature, bug fix, architectural decision, a stub
becoming a real implementation, a dependency added/removed, etc.):

1. Append a dated entry under **Changelog** in `ADAPTATION_NOTES.md` describing what changed and
   why.
2. If the change alters or resolves a standing deviation from ipaas, update the
   **Differences from ipaas** section too — e.g. once a stub is replaced with a real backend
   call, move that note out of "Differences" (it's no longer a difference, it's just how the app
   works) and mention the swap in the changelog instead.

Treat this as part of finishing the change, the same as running lint/tests before calling
something done — not an optional follow-up, and not something to batch up and do later.

## Tech stack

React 19 + TypeScript, Vite 7 (`@vitejs/plugin-react-swc`), React Router v7, TanStack Query v5
for all server state (no Redux/Zustand — narrow React Context only for cross-cutting concerns
like auth/access-control), `@wso2/oxygen-ui` (+ `-icons-react`) as the design system. Plain
`useState`-controlled forms — no react-hook-form/Formik, matching ipaas convention. ESLint 9
flat config + Prettier, Vitest for unit tests, Playwright configured for e2e (no `playwright.config.ts`
or e2e tests written yet).

## Architecture / layering

Same four-layer rule as ipaas: **`pages/` + `components/` → `hooks/` → `api/` → `auth/tokenManager.ts`**
(the transport). Never call `api/` or `fetch` directly from a page or component — always through
a `hooks/` TanStack Query wrapper.

- `src/pages/` — one file per route, wired up in `src/config/routes.tsx`.
- `src/hooks/` — `useQuery`/`useMutation` wrappers, the only layer allowed to call `api/`.
- `src/api/` — **all currently stubbed** (see below): resolve from `src/mock-data/*.ts` after an
  artificial delay, with signatures written to match a real REST client.
- `src/nav.ts` / `src/paths.ts` — the Org → Project → WebApp scope type and every route's URL
  builder. **Never write a raw URL/path string anywhere else** — always call a builder from
  `paths.ts` (a HOUSE_RULES.md rule inherited from ipaas).
- `src/layouts/AppLayout.tsx` — the authenticated app shell (org/project switcher, sidebar).
  Inside a web app the sidebar shows Overview, Build, Deploy, Observe, DevOps and Settings
  (items declared in `src/nav.ts`); org/project level only has "Overview". Don't add pages for
  sections that aren't designed yet (see `ADAPTATION_NOTES.md` → Sidebar scope for what was
  deliberately left out).
- `src/auth/` — OIDC+PKCE, ported from ipaas.
- `src/contexts/AccessControlContext.tsx` / `src/components/Authorized.tsx` — **always-allow
  stub**, no real permission model exists yet.

## Backend (BFF) and what is still stubbed

`src/api/*.ts` call the BFF in `backend/` (see `ADAPTATION_NOTES.md` → "Backend"). Custom domains
are still a stub and show "Coming soon". Paid-only features are gated by the org's plan (`usePlan`;
the BFF answers `403 PLAN_REQUIRED`). When the BFF grows an
endpoint, add it to `backend/api/openapi.yaml` (a test keeps the router in sync), then replace the
matching `src/api/*.ts` body; hooks only change for new parameters.

Web-app pages are per **deployment track**: use the `track: TrackRef` and `environment` from
`WebAppPage`'s render context (never `webApp.id` for track-scoped data), and build links with
`paths.withTrack` so the selected track survives navigation.

## Conventions inherited from ipaas (still apply here)

- Always render explicit loading / error / not-found / empty states with an early return — never
  fall through to rendering the main view before data is ready.
- Avoid `useEffect` unless synchronizing with a genuine external system (a `BroadcastChannel`
  listener, a popup window) — not for derived state or to react to a prop change.
- `sx` props: inline for one-off styling; hoist to a co-located `*.styles.ts` once a style block
  is reused ~5+ times or has 6+ properties.
- Don't trivially swallow `null`/`undefined` (`?? ''`, non-null `!`) — prefer explicit type
  guards / early returns.

## Local development

All commands below run from `frontend/`.

- `pnpm dev` — dev server on `https://localhost:3000` (self-signed cert, one-time browser
  warning) with `public/config.json` (placeholders for the deployed console).
- `pnpm dev:local` — the same against a local OpenChoreo on k3d (`public/config.local.json`; proxies the
  local BFF and ThunderID). See the repo `README.md` for the full local setup.
- `pnpm demo` — launches straight into a seeded fake session at `/dev-login` (dev-only route,
  stripped from production builds) so the app is demoable without a real IdP. See
  `src/pages/DevSeedSession.tsx` / `AuthContext.devLogin`.
- `pnpm lint`, `pnpm build:check` (`tsc -b && vite build`), `pnpm test:unit` — run all three
  before considering a change done.
