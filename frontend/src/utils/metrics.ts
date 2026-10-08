/** Series name for a request/limit line, which covers every desired replica: "CPU limit (2 replicas)". */
export function allocationSeriesName(name: string, replicas: number | undefined): string {
  if (replicas === undefined) return name;
  return `${name} (${replicas} ${replicas === 1 ? 'replica' : 'replicas'})`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** X-axis label: time of day (every metrics range is at most a day long). */
export function bucketLabel(time: number): string {
  const d = new Date(time);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
