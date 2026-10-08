import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import DeployedGate from '../components/runtime/DeployedGate';
import ProbeCard from '../components/healthChecks/ProbeCard';
import ProbeForm from '../components/healthChecks/ProbeForm';
import { useHealthCheck, useUpdateHealthCheck } from '../hooks/useHealthChecks';
import { useReleaseDetails } from '../hooks/useRuntime';
import { PROBE_KIND, type HealthCheck, type Probe, type ProbeKind } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';

interface Notice {
  severity: 'success' | 'error';
  message: string;
}

const probeKey = (kind: ProbeKind) => (kind === PROBE_KIND.LIVENESS ? 'livenessProbe' : 'readinessProbe');

function HealthChecksBody({ track, environment, environmentName }: { track: TrackRef; environment: EnvironmentId; environmentName: string }): JSX.Element {
  const { data: healthCheck, isLoading, isError, refetch } = useHealthCheck(track, environment);
  const release = useReleaseDetails(track, environment);
  const update = useUpdateHealthCheck(track, environment);
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

  const port = release.data?.port || undefined;

  const save = async (kind: ProbeKind, probe: Probe | undefined, successMessage: string, onDone: () => void): Promise<void> => {
    const next: HealthCheck = { ...healthCheck, [probeKey(kind)]: probe };
    try {
      await update.mutateAsync(next);
      onDone();
      setNotice({ severity: 'success', message: successMessage });
    } catch (e) {
      setNotice({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to save the health check.' });
    }
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
        <ProbeForm
          key={editing}
          kind={editing}
          existing={existing}
          defaultPort={port}
          isSaving={update.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(probe) => void save(editing, probe, `${editing} probe saved. ${environmentName} is restarting with it.`, () => setEditing(null))}
        />
        {snackbar}
      </>
    );
  }

  const readinessDefault = `Not configured: a replica receives traffic once it accepts TCP connections${port ? ` on port ${port}` : ''}.`;

  return (
    <>
      <Alert severity="info" sx={{ mb: 3 }}>
        Probes apply to {environmentName} only. Saving or removing one restarts the environment&apos;s replicas.
      </Alert>
      <Stack gap={2}>
        {[PROBE_KIND.LIVENESS, PROBE_KIND.READINESS].map((kind) => (
          <ProbeCard
            key={kind}
            kind={kind}
            probe={healthCheck[probeKey(kind)]}
            busy={update.isPending}
            onConfigure={() => setEditing(kind)}
            onDelete={() => setDeleting(kind)}
            unsetNote={kind === PROBE_KIND.READINESS ? readinessDefault : 'Not configured: a crashed container is still restarted, but a hung one is not detected.'}
          />
        ))}
      </Stack>

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete {deleting?.toLowerCase()} probe?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The probe is removed from {environmentName} and its replicas restart.
            {deleting === PROBE_KIND.READINESS && ' Readiness falls back to the default TCP check.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={update.isPending}
            onClick={() => {
              if (deleting) void save(deleting, undefined, `${deleting} probe removed.`, () => setDeleting(null));
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
  return (
    <WebAppPage title="Health Checks" description="Liveness and readiness probes that keep your web app available, per environment." withEnvironment>
      {({ track, environment, environmentName }) => (
        <DeployedGate track={track} environment={environment} environmentName={environmentName}>
          <HealthChecksBody key={`${track.trackId}:${environment}`} track={track} environment={environment} environmentName={environmentName} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
