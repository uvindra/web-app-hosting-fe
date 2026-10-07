import { useEffect, useState, type JSX } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Box, CircularProgress } from '@wso2/oxygen-ui';
import { useAuth } from '../auth/AuthContext';
import { orgHomeUrl } from '../paths';

/** Local OpenChoreo's single org (override with ?org=). */
const DEFAULT_ORG = 'default';

// Dev-only: seeds a fake local session (see `AuthContext.devLogin`) so the app runs without an IdP.
// Pair it with the BFF in AUTH_MODE=dev (local OpenChoreo only), which then uses its own client
// credentials for every platform call. This route only exists when
// `import.meta.env.DEV` is true (see config/routes.tsx) and is dropped from production builds.
// Run `pnpm demo` to launch straight into it.
export default function DevSeedSession(): JSX.Element {
  const { devLogin } = useAuth();
  const [params] = useSearchParams();
  const orgHandle = params.get('org') || window.API_CONFIG.orgHandle || DEFAULT_ORG;
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    devLogin(orgHandle);
    setSeeded(true);
  }, [devLogin, orgHandle]);

  if (!seeded) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return <Navigate to={orgHomeUrl(orgHandle)} replace />;
}
