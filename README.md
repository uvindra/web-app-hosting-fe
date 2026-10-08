# WSO2 Web App Hosting

Monorepo for the Web App Hosting console and its BFF.

| Path | Contents |
|---|---|
| `frontend/` | Console: React 19 + Vite + TanStack Query + `@wso2/oxygen-ui`. Run `pnpm` here. |
| `backend/` | BFF (`webapp-service`, Go): maps web apps / tracks / builds / deployments onto OpenChoreo. API contract: `backend/api/openapi.yaml`. |
| `.cicd/` | WSO2 Cloud CI build contracts for both images. |

The BFF runs against two targets (`TARGET`):

- `wso2cloud` — behind the WSO2 Cloud platform-api-service (PAS), git-app-service, secret-manager-api and cloud-obs-proxy.
- `openchoreo` — a plain local OpenChoreo on k3d (`k3d-openchoreo`), for trying things out before WSO2 Cloud.

## Run locally against OpenChoreo on k3d

Prerequisites: the `k3d-openchoreo` cluster (OpenChoreo 1.3, namespace `default`), `kubectl`, `curl`, `jq`, Go 1.26, Node 22 + pnpm.

1. **One-time setup** (idempotent): registers the ThunderID apps `web-app-hosting-console-local` (PKCE) and
   `web-app-hosting-bff-local` (client credentials) and grants both an OpenChoreo authz role in namespace `default`.

   ```sh
   cd backend && make setup-local      # = ./dev/setup-local-openchoreo.sh
   ```

2. **BFF** on `http://localhost:9090/webapp-hosting/api/v1`:

   ```sh
   cd backend && make run-local        # loads dev/local.env, = go run ./cmd/webapp-service --target openchoreo
   ```

   The BFF dials `*.localhost` hosts (`api.`, `thunder.`, `observer.openchoreo.localhost`) on 127.0.0.1 itself, so no
   `/etc/hosts` entries are needed. If another tool (or your browser) can't resolve them, add
   `127.0.0.1 api.openchoreo.localhost thunder.openchoreo.localhost observer.openchoreo.localhost` to `/etc/hosts`.

3. **Console** on `https://localhost:3000`:

   ```sh
   cd frontend && pnpm install && pnpm dev:local
   ```

   `dev:local` serves `public/config.local.json` as the runtime config and proxies the BFF (`/__bff`) and ThunderID's
   token endpoint (`/__thunder`) through the Vite dev server, so neither needs CORS for `https://localhost:3000`.
   Sign in as `admin@openchoreo.dev` (stock OpenChoreo user; password from your OpenChoreo install), or use
   `/dev-login` with the BFF in `AUTH_MODE=dev` (no IdP; every platform call uses the BFF's client).

4. **Integration test** (optional; creates a project + web app from `wso2/choreo-samples`, builds, deploys, promotes
   and cleans up):

   ```sh
   cd backend && make integration                   # static preset, a few minutes
   WAH_IT_PRESET=react make integration             # full React build, slower
   ```

Local differences from WSO2 Cloud: public GitHub repositories only (no GitHub App), secrets via the OpenChoreo Secret
API, logs and metrics straight from the Observer (CPU/memory only — the local Prometheus has no HTTP request
metrics), no billing (the console hides billing UI; every org is on `LOCAL_PLAN` = `paid` | `free` from
`dev/local.env`, to try the plan gating), builds are manual/auto-deploy only (GitHub push webhooks can't reach
localhost). Container-image web apps work the same (public images only).

## Checks

- BFF: `cd backend && go build ./... && go vet ./... && go test ./...`
- Console: `cd frontend && pnpm lint && pnpm build:check && pnpm test:unit`

See `CLAUDE.md` for conventions and `ADAPTATION_NOTES.md` for the console's state and changelog.
