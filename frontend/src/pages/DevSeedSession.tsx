import { useEffect, useState, type JSX } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Box, CircularProgress } from '@wso2/oxygen-ui';
import { useAuth } from '../auth/AuthContext';
import { orgHomeUrl } from '../paths';

const DEFAULT_ORG = 'amiladesilva';

// Dev-only: seeds a fake local session (see `AuthContext.devLogin`) so the app is demoable
// without a real WSO2 Identity Platform tenant configured. This route only exists when
// `import.meta.env.DEV` is true (see config/routes.tsx) and is dropped from production builds.
// Run `pnpm demo` to launch straight into it.
export default function DevSeedSession(): JSX.Element {
  const { devLogin } = useAuth();
  const [params] = useSearchParams();
  const orgHandle = params.get('org') || DEFAULT_ORG;
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
