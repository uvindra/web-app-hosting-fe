import { useState, type JSX } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { Button, Card, CardContent, Stack, Typography } from '@wso2/oxygen-ui';
import type { ReadyWebAppContext } from '../components/webapp/WebAppPage';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { useDeleteWebApp } from '../hooks/useWebApps';
import { projectHomeUrl } from '../paths';

/** General web-app settings: the danger zone (delete the web app). */
export default function WebAppGeneralSettings(): JSX.Element {
  const navigate = useNavigate();
  const { scope, project, webApp } = useOutletContext<ReadyWebAppContext>();
  const del = useDeleteWebApp(project.id);
  const [confirming, setConfirming] = useState(false);

  // mutateAsync: this page unmounts once the web app leaves the cache, and per-call mutate callbacks don't fire after unmount.
  const confirmDelete = async () => {
    try {
      await del.mutateAsync(webApp.id);
      navigate(projectHomeUrl(scope.org, scope.project));
    } catch {
      /* shown in the dialog via del.error */
    }
  };

  return (
    <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
      <CardContent>
        <Typography variant="h6" component="h2" color="error" sx={{ mb: 2 }}>
          Danger zone
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
          <Stack gap={0.5}>
            <Typography variant="body1" fontWeight={600}>
              Delete this web app
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Undeploys it from every environment and permanently deletes all its deployment tracks, builds, configs and
              secrets. Each deleted track frees a quota slot.
            </Typography>
          </Stack>
          <Button
            variant="outlined"
            color="error"
            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => {
              del.reset();
              setConfirming(true);
            }}
          >
            Delete web app
          </Button>
        </Stack>
      </CardContent>
      {confirming && (
        <ConfirmDeleteDialog
          title="Delete web app?"
          description={
            <>
              This permanently deletes <strong>{webApp.displayName}</strong> and all its deployment tracks. This can't be undone.
            </>
          }
          confirmText={webApp.handler}
          pending={del.isPending}
          error={del.error}
          onConfirm={() => void confirmDelete()}
          onClose={() => setConfirming(false)}
        />
      )}
    </Card>
  );
}
