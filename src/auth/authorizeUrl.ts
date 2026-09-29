interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  resource?: string;
  fidp?: string;
}

export function buildAuthorizationUrl(endpoint: string, request: AuthorizationRequest): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    scope: request.scope,
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: 'S256',
  });
  if (request.resource?.trim()) params.set('resource', request.resource.trim());
  if (request.fidp) params.set('fidp', request.fidp);
  return `${endpoint}?${params}`;
}
