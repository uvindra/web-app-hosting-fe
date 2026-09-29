import { Box, Button, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Login(): JSX.Element {
  const { loginWithOIDC } = useAuth();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 3, width: '100%' }}>
      <Typography variant="h4" component="h1">
        WSO2 Web App Hosting
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Build, deploy, and manage web applications.
      </Typography>
      <Button variant="contained" size="large" onClick={() => loginWithOIDC()}>
        Sign in with WSO2 Cloud
      </Button>
    </Box>
  );
}
