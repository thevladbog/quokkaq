import type { useTranslations } from 'next-intl';

/**
 * Formats a duration given in milliseconds as a human-readable "minutes + seconds" string.
 * Used in statistics components (leaderboard, operator details).
 *
 * Examples:
 *   60000  → "1м 00с" or "1m 00s" (depending on locale)
 *   90000  → "1м 30с" or "1m 30s" (depending on locale)
 *   0      → "—"
 */
export function formatDurationMs(
  ms: number | undefined,
  t: ReturnType<typeof useTranslations<'statistics'>>
): string {
  if (!ms) return '—';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return t('duration_format_min_sec', {
    minutes: min,
    seconds: sec.toString().padStart(2, '0')
  });
}
