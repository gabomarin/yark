/**
 * Relative uptime for a running dedicated process (#301).
 * Uses `–` when not running or `startedAt` is missing/invalid.
 */
export function formatServerUptime(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (startedAt == null || startedAt.trim() === "") {
    return "–";
  }
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs) || startMs > nowMs) {
    return "–";
  }
  const totalSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
