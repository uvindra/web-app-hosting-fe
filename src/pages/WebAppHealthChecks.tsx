import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar, Stack } from '@wso2/oxygen-ui';
import { HeartPulse } from '@wso2/oxygen-ui-icons-react';
import WebAppPage from '../components/webapp/WebAppPage';
import EnvironmentSelect from '../components/webapp/EnvironmentSelect';
import EmptyListing from '../components/EmptyListing';
import ProbeCard from '../components/healthChecks/ProbeCard';
import ProbeForm from '../components/healthChecks/ProbeForm';
import { useHealthCheck, useUpdateHealthCheck } from '../hooks/useHealthChecks';
import { PROBE_KIND, type HealthCheck, type Probe, type ProbeKind } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';

interface Notice {
  severity: 'success' | 'error';
  message: string;
}

const probeKey = (kind: ProbeKind) => (kind === PROBE_KIND.LIVENESS ? 'livenessProbe' : 'readinessProbe');

function HealthChecksBody({ webAppId, environment }: { webAppId: string; environment: EnvironmentId }): JSX.Element {
  const { data: healthCheck, isLoading, isError, refetch } = useHealthCheck(webAppId, environment);
  const update = useUpdateHealthCheck(webAppId, environment);
  const [editing, setEditing] = useState<ProbeKind | null>(null);
  const [deleting, setDeleting] = useState<ProbeKind | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !healthCheck) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refetch()}>
            Retry
          </Button>
        }>
        Failed to load health checks.
      </Alert>
    );
  }

  const save = (kind: ProbeKind, probe: Probe | undefined, successMessage: string, onDone: () => void): void => {
    const next: HealthCheck = { ...healthCheck, [probeKey(kind)]: probe };
    update.mutate(next, {
      onSuccess: () => {
        onDone();
        setNotice({ severity: 'success', message: successMessage });
      },
      onError: (e) => setNotice({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to save the health check.' }),
    });
  };

  const snackbar = (
    <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      {notice ? (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} variant="filled">
          {notice.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );

  if (editing) {
    const existing = healthCheck[probeKey(editing)];
    return (
      <>
        <ProbeForm key={editing} kind={editing} existing={existing} isSaving={update.isPending} onClose={() => setEditing(null)} onSubmit={(probe) => save(editing, probe, `${editing} probe saved.`, () => setEditing(null))} />
        {snackbar}
      </>
    );
  }

  const hasAny = healthCheck.livenessProbe !== undefined || healthCheck.readinessProbe !== undefined;

  return (
    <>
      {!hasAny && (
        <Box sx={{ mb: 3 }}>
          <EmptyListing icon={<HeartPulse size={48} />} title="No health checks configured" description="Add a liveness or readiness probe so the platform can detect and recover unhealthy replicas." />
        </Box>
      )}
      <Stack gap={2}>
        {[PROBE_KIND.LIVENESS, PROBE_KIND.READINESS].map((kind) => (
          <ProbeCard key={kind} kind={kind} probe={healthCheck[probeKey(kind)]} busy={update.isPending} onConfigure={() => setEditing(kind)} onDelete={() => setDeleting(kind)} />
        ))}
      </Stack>

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete {deleting?.toLowerCase()} probe?</DialogTitle>
        <DialogContent>
          <DialogContentText>The probe is removed from this environment the next time the web app is deployed.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={update.isPending}
            onClick={() => {
              if (deleting) save(deleting, undefined, `${deleting} probe removed.`, () => setDeleting(null));
            }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      {snackbar}
    </>
  );
}

export default function WebAppHealthChecks(): JSX.Element {
  const [environment, setEnvironment] = useState<EnvironmentId>('development');
  return (
    <WebAppPage title="Health Checks" description="Liveness and readiness probes that keep your web app available." actions={<EnvironmentSelect value={environment} onChange={setEnvironment} />}>
      {({ webApp }) => <HealthChecksBody webAppId={webApp.id} environment={environment} />}
    </WebAppPage>
  );
}
