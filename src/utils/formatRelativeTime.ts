/** Relative time (e.g. "3 hours ago"). Returns '' for missing/invalid input. */
export function formatRelativeTime(dateStr: string): string {
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return '';
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
