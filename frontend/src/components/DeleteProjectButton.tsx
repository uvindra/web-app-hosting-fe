import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Button, Tooltip } from '@wso2/oxygen-ui';
import { Trash2 } from '@wso2/oxygen-ui-icons-react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import { useDeleteProject, useProject } from '../hooks/useProjects';
import { orgHomeUrl } from '../paths';
import type { Project } from '../types/project';

interface DeleteProjectButtonProps {
  org: string;
  project: Project;
}

/** Why a project can't be deleted, or null. Projects are shared across WSO2 Cloud products, so any component blocks it. */
function blockedReason(project: Project, componentCount: number | undefined): string | null {
  if (project.isDefault) return 'The default project cannot be deleted.';
  if (componentCount === undefined) return 'Checking whether the project is empty…';
  if (componentCount > 0) {
    return `The project still has ${componentCount} component${componentCount === 1 ? '' : 's'} (web apps or other WSO2 Cloud resources). Delete them first.`;
  }
  return null;
}

/** "Delete project" action for the project overview: type-to-confirm, disabled with a reason while the project isn't deletable. */
export default function DeleteProjectButton({ org, project }: DeleteProjectButtonProps): JSX.Element {
  const navigate = useNavigate();
  // The single-project read carries the all-product component count; the list doesn't.
  const { data: detail } = useProject(project.id);
  const del = useDeleteProject();
  const [confirming, setConfirming] = useState(false);
  const reason = blockedReason(project, detail?.componentCount);

  const confirmDelete = async () => {
    try {
      await del.mutateAsync(project.id);
      navigate(orgHomeUrl(org));
    } catch {
      /* shown in the dialog via del.error */
    }
  };

  return (
    <>
      <Tooltip title={reason ?? ''}>
        <span>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Trash2 size={18} />}
            disabled={reason !== null}
            onClick={() => {
              del.reset();
              setConfirming(true);
            }}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Delete project
          </Button>
        </span>
      </Tooltip>
      {confirming && (
        <ConfirmDeleteDialog
          title="Delete project?"
          description={
            <>
              This permanently deletes the project <strong>{project.name}</strong>. This can't be undone.
            </>
          }
          confirmText={project.handler}
          pending={del.isPending}
          error={del.error}
          onConfirm={() => void confirmDelete()}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
