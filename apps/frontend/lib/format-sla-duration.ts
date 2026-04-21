/**
 * Formats a duration given in seconds as a human-readable "minutes + seconds" string.
 * Used in SLA alert toast messages.
 *
 * Examples:
 *   60  → "1 min"
 *   90  → "1m 30s"
 *   0   → "0 min"
 */
export function formatSlaDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}
