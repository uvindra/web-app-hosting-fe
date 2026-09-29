/** The oxygen-ui (MUI) palette color names accepted by Chip's `color` prop. */
export type PaletteColor = 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';

const STATUS_COLORS: Record<string, PaletteColor> = {
  active: 'success',
  deploying: 'warning',
  'not-deployed': 'default',
  failed: 'error',
};

export function getStatusColor(status: string): PaletteColor {
  return STATUS_COLORS[status] ?? 'default';
}
