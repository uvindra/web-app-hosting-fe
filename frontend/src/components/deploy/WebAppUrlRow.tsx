import { useState } from 'react';
import type { JSX } from 'react';
import { IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Copy, ExternalLink } from '@wso2/oxygen-ui-icons-react';

const COPIED_FEEDBACK_MS = 1500;

/** The deployed web app URL with copy + open-in-new-tab actions. */
export default function WebAppUrlRow({ url }: { url: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
        Web App URL:
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>
        {url}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy URL'}>
        <IconButton size="small" aria-label="Copy URL" onClick={() => void handleCopy()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Open in new tab">
        <IconButton size="small" aria-label="Open in new tab" component="a" href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
