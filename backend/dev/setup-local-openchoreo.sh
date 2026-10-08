#!/usr/bin/env bash
# Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License. You may obtain a copy of the License at
# http://www.apache.org/licenses/LICENSE-2.0
#
# Idempotent local setup for running the Web App Hosting BFF + console against
# a local OpenChoreo on k3d (TARGET=openchoreo).
#
# What it does (and nothing else — existing Thunder clients, OC bindings and
# helm releases are left untouched):
#   1. Registers two ThunderID applications through Thunder's management API,
#      authenticating as the stock `openchoreo-system-app` (which the
#      OpenChoreo install grants the Thunder "system" permission):
#        - web-app-hosting-console-local  PKCE public client for the console
#        - web-app-hosting-bff-local      client_credentials client for the BFF
#   2. Creates a namespaced OC AuthzRole `web-app-hosting` in namespace
#      `default` and AuthzRoleBindings granting it to both clients (by the
#      `client_id` claim).
#
# Usage: backend/dev/setup-local-openchoreo.sh
# Env overrides: KUBE_CONTEXT, THUNDER_URL, OC_NAMESPACE, CONSOLE_ORIGIN,
#                BFF_CLIENT_SECRET.
set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-k3d-openchoreo}"
THUNDER_URL="${THUNDER_URL:-http://thunder.openchoreo.localhost:8080}"
OC_NAMESPACE="${OC_NAMESPACE:-default}"
CONSOLE_ORIGIN="${CONSOLE_ORIGIN:-https://localhost:3000}"
CONSOLE_CLIENT_ID="web-app-hosting-console-local"
BFF_CLIENT_ID="web-app-hosting-bff-local"
BFF_CLIENT_SECRET="${BFF_CLIENT_SECRET:-web-app-hosting-bff-local-secret}"
# Stock OpenChoreo Thunder bootstrap values (thunder-bootstrap ConfigMap).
SYSTEM_CLIENT_ID="openchoreo-system-app"
SYSTEM_CLIENT_SECRET="openchoreo-system-app-secret"
DEFAULT_OU_ID="01900000-0000-7000-8000-000000000001"
DEFAULT_AUTH_FLOW_ID="01900000-0000-7000-8000-000000000061"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 1; }; }
need curl; need jq; need kubectl

echo "==> Getting a Thunder management token as ${SYSTEM_CLIENT_ID}"
ADMIN_TOKEN="$(curl -fsS -X POST "${THUNDER_URL}/oauth2/token" \
  -d grant_type=client_credentials -d scope=system \
  -d client_id="${SYSTEM_CLIENT_ID}" -d client_secret="${SYSTEM_CLIENT_SECRET}" \
  --data-urlencode "resource=${THUNDER_URL}/mcp" | jq -r .access_token)"
[ -n "${ADMIN_TOKEN}" ] && [ "${ADMIN_TOKEN}" != null ] || { echo "could not get a Thunder management token" >&2; exit 1; }

thunder() { curl -fsS -H "Authorization: Bearer ${ADMIN_TOKEN}" -H 'Content-Type: application/json' "$@"; }

app_exists() {
  # The list endpoint omits clientId, so read each application's detail.
  local want="$1" id
  for id in $(thunder "${THUNDER_URL}/applications" | jq -r '.applications[].id'); do
    if [ "$(thunder "${THUNDER_URL}/applications/${id}" | jq -r '.inboundAuthConfig[0].config.clientId // empty')" = "${want}" ]; then
      return 0
    fi
  done
  return 1
}

ensure_app() {
  local client_id="$1" body="$2"
  if app_exists "${client_id}"; then
    echo "    ${client_id}: already registered"
  else
    thunder -X POST "${THUNDER_URL}/applications" -d "${body}" >/dev/null
    echo "    ${client_id}: registered"
  fi
}

echo "==> Registering ThunderID applications"
ensure_app "${CONSOLE_CLIENT_ID}" "$(jq -n \
  --arg ou "${DEFAULT_OU_ID}" --arg flow "${DEFAULT_AUTH_FLOW_ID}" \
  --arg cid "${CONSOLE_CLIENT_ID}" --arg origin "${CONSOLE_ORIGIN}" '{
  ouId: $ou, name: "Web App Hosting Console (local)", type: "custom",
  description: "Web App Hosting console, local OpenChoreo target",
  authFlowId: $flow, allowedUserTypes: ["openchoreo-user"],
  assertion: {validityPeriod: 3600},
  inboundAuthConfig: [{type: "oauth2", config: {
    clientId: $cid,
    redirectUris: [($origin + "/signin"), $origin],
    grantTypes: ["authorization_code", "refresh_token"], responseTypes: ["code"],
    tokenEndpointAuthMethod: "none", pkceRequired: true, publicClient: true,
    token: {
      accessToken: {userConfig: {validityPeriod: 3600, attributes: ["given_name","family_name","username","email","groups","ouId","ouHandle","ouName"]}},
      idToken: {validityPeriod: 3600, userAttributes: ["given_name","family_name","username","email","groups","ouId","ouHandle","ouName"]}
    },
    scopeClaims: {email: ["email"], groups: ["groups"], profile: ["username","given_name","family_name","groups"]}
  }}]}')"

ensure_app "${BFF_CLIENT_ID}" "$(jq -n \
  --arg ou "${DEFAULT_OU_ID}" --arg cid "${BFF_CLIENT_ID}" --arg secret "${BFF_CLIENT_SECRET}" '{
  ouId: $ou, name: "Web App Hosting BFF (local)", type: "m2m",
  description: "Web App Hosting BFF service identity, local OpenChoreo target",
  inboundAuthConfig: [{type: "oauth2", config: {
    clientId: $cid, clientSecret: $secret,
    grantTypes: ["client_credentials"], tokenEndpointAuthMethod: "client_secret_post",
    pkceRequired: false, publicClient: false,
    token: {accessToken: {clientConfig: {validityPeriod: 3600}}}
  }}]}')"

echo "==> Applying OpenChoreo authz role + bindings in namespace ${OC_NAMESPACE}"
kubectl --context "${KUBE_CONTEXT}" apply -f - <<YAML
apiVersion: openchoreo.dev/v1alpha1
kind: AuthzRole
metadata:
  name: web-app-hosting
  namespace: ${OC_NAMESPACE}
  labels:
    app.kubernetes.io/part-of: web-app-hosting
spec:
  actions:
    - namespace:view
    - environment:view
    - deploymentpipeline:view
    - dataplane:view
    - workflowplane:view
    - observabilityplane:view
    - clustercomponenttype:view
    - clustertrait:view
    - clusterworkflow:view
    - componenttype:*
    - workflow:*
    - trait:*
    - project:*
    - projectrelease:view
    - projectreleasebinding:*
    - component:*
    - componentrelease:*
    - releasebinding:*
    - workload:*
    - workflowrun:*
    - secretreference:*
    - secret:*
    - logs:view
    - events:view
    - metrics:view
---
apiVersion: openchoreo.dev/v1alpha1
kind: AuthzRoleBinding
metadata:
  name: web-app-hosting-bff-local
  namespace: ${OC_NAMESPACE}
  labels:
    app.kubernetes.io/part-of: web-app-hosting
spec:
  effect: allow
  entitlement:
    claim: client_id
    value: ${BFF_CLIENT_ID}
  roleMappings:
    - roleRef:
        kind: AuthzRole
        name: web-app-hosting
---
apiVersion: openchoreo.dev/v1alpha1
kind: AuthzRoleBinding
metadata:
  name: web-app-hosting-console-local
  namespace: ${OC_NAMESPACE}
  labels:
    app.kubernetes.io/part-of: web-app-hosting
spec:
  effect: allow
  entitlement:
    claim: client_id
    value: ${CONSOLE_CLIENT_ID}
  roleMappings:
    - roleRef:
        kind: AuthzRole
        name: web-app-hosting
YAML

echo "==> Checking a BFF client_credentials token"
curl -fsS -X POST "${THUNDER_URL}/oauth2/token" -d grant_type=client_credentials \
  -d client_id="${BFF_CLIENT_ID}" -d client_secret="${BFF_CLIENT_SECRET}" | jq -e .access_token >/dev/null && echo "    ok"

cat <<INFO

Done. Local values:
  Console client ID : ${CONSOLE_CLIENT_ID} (redirect ${CONSOLE_ORIGIN}/signin)
  BFF client        : ${BFF_CLIENT_ID} / ${BFF_CLIENT_SECRET}
  Users             : admin@openchoreo.dev, developer@openchoreo.dev (stock OpenChoreo users)
INFO
