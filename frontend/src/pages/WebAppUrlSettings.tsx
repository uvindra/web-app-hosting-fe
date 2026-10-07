import type { JSX } from 'react';
import { useOutletContext } from 'react-router';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import type { ReadyWebAppContext } from '../components/webapp/WebAppPage';
import DefaultUrlRow from '../components/urlSettings/DefaultUrlRow';
import ComingSoon from '../components/ComingSoon';
import TrackSelect from '../components/webapp/TrackSelect';
import { environmentLabel } from '../constants/environments';
import { useDefaultUrls } from '../hooks/useUrlSettings';

/** Default URL per pipeline environment for the selected track; custom domains are P2. */
export default function WebAppUrlSettings(): JSX.Element {
  const { track, environments } = useOutletContext<ReadyWebAppContext>();
  const defaults = useDefaultUrls(track);

  if (defaults.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (defaults.isError || !defaults.data) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void defaults.refetch()}>
            Retry
          </Button>
        }>
        Failed to load URL settings.
      </Alert>
    );
  }

  return (
    <Stack gap={4}>
      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6" component="h2">
            Default URLs
          </Typography>
          <TrackSelect track={track} />
        </Stack>
        {defaults.data.map((d) =>
          d.url ? (
            <DefaultUrlRow key={d.environment} label={environmentLabel(environments, d.environment)} url={d.url} />
          ) : (
            <Stack key={d.environment} sx={{ py: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {environmentLabel(environments, d.environment)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Not deployed
              </Typography>
            </Stack>
          ),
        )}
      </Box>
      <ComingSoon title="Custom domains" description="Map your own domain to an environment with automatic TLS certificates." />
    </Stack>
  );
}
