const PREFIX = "safespace:drill:";

export function getLastDrillAt(roomId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${roomId}`);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function recordDrill(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${PREFIX}${roomId}`, String(Date.now()));
  } catch {
    // Ignore quota errors.
  }
}

export function formatLastDrill(at: number | null): string | null {
  if (!at) return null;
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return "Drill completed today";
  if (days === 1) return "Last drill: yesterday";
  if (days < 30) return `Last drill: ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "Last drill: 1 month ago" : `Last drill: ${months} months ago`;
}
