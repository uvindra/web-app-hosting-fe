import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { MenuItem, Select } from '@wso2/oxygen-ui';
import { GitBranch } from '@wso2/oxygen-ui-icons-react';
import { useDeploymentTracks } from '../../hooks/useDeploymentTracks';
import { TRACK_PARAM } from '../../paths';
import type { TrackRef } from '../../types/track';

/** Deployment-track picker: a track is one branch of the web app's repository. The choice lives in `?track=`. */
export default function TrackSelect({ track }: { track: TrackRef }): JSX.Element | null {
  const [params, setParams] = useSearchParams();
  const { data: tracks } = useDeploymentTracks(track.webAppId);
  if (!tracks || tracks.length === 0) return null;
  return (
    <Select
      size="small"
      value={tracks.some((t) => t.id === track.trackId) ? track.trackId : ''}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        const chosen = tracks.find((t) => t.id === e.target.value);
        if (!chosen || chosen.isDefault) next.delete(TRACK_PARAM);
        else next.set(TRACK_PARAM, chosen.id);
        setParams(next);
      }}
      startAdornment={<GitBranch size={16} style={{ marginRight: 6 }} />}
      sx={{ minWidth: 180 }}
      inputProps={{ 'aria-label': 'Deployment track' }}>
      {tracks.map((t) => (
        <MenuItem key={t.id} value={t.id}>
          {t.branch || 'image'}
          {t.isDefault ? ' (default)' : ''}
        </MenuItem>
      ))}
    </Select>
  );
}
