import type { JSX } from 'react';
import { Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@wso2/oxygen-ui';

interface ScaleMethodCardProps {
  title: string;
  description: string;
  selected: boolean;
  /** Small chip next to the title, e.g. "Recommended". */
  badge?: string;
  onSelect: () => void;
}

export default function ScaleMethodCard({ title, description, selected, badge, onSelect }: ScaleMethodCardProps): JSX.Element {
  return (
    <Card
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 240,
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: 'primary.main' },
      }}>
      <CardActionArea aria-pressed={selected} onClick={onSelect} sx={{ height: '100%' }}>
        <CardContent>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: selected ? 'primary.main' : 'text.primary' }}>
              {title}
            </Typography>
            {badge && <Chip label={badge} size="small" color="primary" variant="outlined" />}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
