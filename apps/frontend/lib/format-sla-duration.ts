import type { useTranslations } from 'next-intl';

/**
 * Formats a duration given in seconds as a human-readable "minutes + seconds" string.
 * Used in SLA alert toast messages.
 *
 * Examples:
 *   60  → "1 мин" or "1 min" (depending on locale)
 *   90  → "1м 30с" or "1m 30s" (depending on locale)
 *   0   → "0 мин" or "0 min" (depending on locale)
 */
export function formatSlaDuration(
  seconds: number,
  t: ReturnType<typeof useTranslations<'statistics'>>
): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0
    ? `${m} ${t('minutes_short')}`
    : t('duration_format_min_sec', {
        minutes: m,
        seconds: s.toString().padStart(2, '0')
      });
}
