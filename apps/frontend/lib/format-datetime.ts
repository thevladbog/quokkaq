/**
 * BCP 47 locale for Intl from next-intl route segment (`en`, `ru`, …).
 */
export function intlLocaleFromAppLocale(locale: string): string {
  if (locale.toLowerCase().startsWith('ru')) return 'ru-RU';
  return 'en-US';
}

export type AppDateStyle = 'short' | 'medium' | 'long' | 'full';

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

const fullOptions: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
};

function dateStyleOptions(style: AppDateStyle): Intl.DateTimeFormatOptions {
  if (style === 'full') return fullOptions;
  return { dateStyle: style };
}

/** Local calendar date as YYYY-MM-DD (for stable `data-*`, not for display). */
export function toLocalDateKey(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatAppDate(
  value: string | Date | null | undefined,
  intlLocale: string,
  style: AppDateStyle = 'short',
  empty = '—'
): string {
  const d = parseDate(value);
  if (!d) return empty;
  return new Intl.DateTimeFormat(intlLocale, dateStyleOptions(style)).format(d);
}

export function formatAppDateTime(
  value: string | Date | null | undefined,
  intlLocale: string,
  dateStyle: AppDateStyle = 'short',
  empty = '—'
): string {
  const d = parseDate(value);
  if (!d) return empty;
  return new Intl.DateTimeFormat(intlLocale, {
    ...dateStyleOptions(dateStyle),
    timeStyle: 'short'
  }).format(d);
}

export function formatAppTime(
  value: string | Date,
  intlLocale: string
): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Value for datetime-local-style controls (local timezone), e.g. `2026-04-08T16:50`.
 * Do not use `toISOString().slice(0, 16)` — that is UTC, not local.
 */
export function toDateTimeLocalString(
  value: string | Date | null | undefined
): string {
  if (value === null || value === undefined || value === '') return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}
