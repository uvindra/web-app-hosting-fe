const pad = (n: number) => String(n).padStart(2, '0');

/** X-axis label: time of day (every metrics range is at most a day long). */
export function bucketLabel(time: number): string {
  const d = new Date(time);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
