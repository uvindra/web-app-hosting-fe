import { useEffect, type JSX } from 'react';
import { Box, CircularProgress, Typography } from '@wso2/oxygen-ui';

const BROADCAST_CHANNEL = 'EXTERNALOAUTH';

/**
 * Bare popup page GitHub redirects back to after the OAuth prompt. Relays the `code`/`state` to
 * the window that opened it via BroadcastChannel, then closes itself. Lives outside AppLayout/
 * ProtectedRoute — it's a throwaway popup, not part of the authenticated app shell.
 */
export default function GitHubAuthCallback(): JSX.Element {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channel.postMessage({ authCode: params.get('code'), state: params.get('state') });
    channel.close();
    window.close();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      <CircularProgress size={28} />
      <Typography variant="body2" color="text.secondary">
        Completing GitHub authorization…
      </Typography>
    </Box>
  );
}
