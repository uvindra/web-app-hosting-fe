import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Box, CircularProgress, Typography, Button } from '@wso2/oxygen-ui';
import { useAuth } from '../auth/AuthContext';
import { validateAndClearOIDCState, getAndClearRedirectUrl } from '../auth/tokenManager';
import { loginUrl, orgHomeUrl } from '../paths';

/** OIDC redirect target (`ASGARDEO_SIGN_IN_REDIRECT_URL`) — exchanges the auth code for tokens. */
export default function SignIn(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleOIDCCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state || !validateAndClearOIDCState(state)) {
      setError('Invalid or expired sign-in request.');
      return;
    }

    handleOIDCCallback(code)
      .then(() => {
        const redirectUrl = getAndClearRedirectUrl();
        const orgHandle = localStorage.getItem('org_handle');
        navigate(redirectUrl ?? (orgHandle ? orgHomeUrl(orgHandle) : loginUrl()), { replace: true });
      })
      .catch((err: Error) => setError(err.message));
    // Runs once on mount — the auth code is single-use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 2, width: '100%' }}>
        <Typography variant="h6">Sign-in failed</Typography>
        <Typography variant="body2" color="text.secondary">
          {error}
        </Typography>
        <Button variant="contained" onClick={() => navigate(loginUrl())}>
          Back to login
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 2, width: '100%' }}>
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">
        Signing you in…
      </Typography>
    </Box>
  );
}
