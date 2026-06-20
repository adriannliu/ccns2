const DAY_MS = 86_400_000;

export function formatPlanAge(createdAt: number, now = Date.now()): string {
  const days = Math.floor((now - createdAt) / DAY_MS);
  if (days <= 0) return "Scanned today";
  if (days === 1) return "Scanned yesterday";
  if (days < 30) return `Scanned ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "Scanned 1 month ago";
  if (months < 12) return `Scanned ${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "Scanned 1 year ago" : `Scanned ${years} years ago`;
}

export function isPlanStale(createdAt: number, now = Date.now()): boolean {
  return now - createdAt > 90 * DAY_MS;
}
