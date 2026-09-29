import { useState, type JSX } from 'react';
import { IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Copy } from '@wso2/oxygen-ui-icons-react';

interface DefaultUrlRowProps {
  label: string;
  url: string;
}

export default function DefaultUrlRow({ label, url }: DefaultUrlRowProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };

  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ py: 1 }}>
      <Stack sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
          {url}
        </Typography>
      </Stack>
      <Tooltip title={copied ? 'Copied' : 'Copy URL'}>
        <IconButton size="small" aria-label={`Copy ${label} URL`} onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
