import { format, isValid, parse, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';

const NAIVE_DATETIME = "yyyy-MM-dd'T'HH:mm:ss" as const;

function hasExplicitOffsetOrZ(s: string): boolean {
  const t = s.trim();
  return (
    /[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t) || /[+-]\d{2}\d{2}$/.test(t)
  );
}

/**
 * Parses statistics API date strings for display in the browser:
 * - `YYYY-MM-DD` — calendar date at local midnight (no UTC day shift).
 * - ISO with `Z` or offset — instant; format() shows browser-local wall time.
 * - Naive `YYYY-MM-DDTHH:mm:ss` (hourly buckets) — local wall time components.
 */
export function parseStatisticsApiDate(value: string): Date {
  const v = value.trim();
  if (!v) {
    return new Date(NaN);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return parse(v, 'yyyy-MM-dd', new Date());
  }
  if (hasExplicitOffsetOrZ(v)) {
    const d = parseISO(v);
    return isValid(d) ? d : new Date(NaN);
  }
  const head = v.slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(head)) {
    return parse(head, NAIVE_DATETIME, new Date());
  }
  const d = parseISO(v);
  return isValid(d) ? d : new Date(NaN);
}

export function formatStatisticsChartAxisLabel(
  value: string | number,
  options: { hourly: boolean; locale: Locale }
): string {
  const s = String(value).trim();
  if (!s) return '';
  const d = parseStatisticsApiDate(s);
  if (!isValid(d)) return s;

  if (options.hourly) {
    return format(d, 'p', { locale: options.locale });
  }
  return format(d, 'd MMM', { locale: options.locale });
}

/** Localized date+time for “statistics as of” lines (API timestamps are usually RFC3339 UTC). */
export function formatStatisticsAsOfLine(
  isoTimestamp: string,
  locale: Locale
): string {
  const d = parseStatisticsApiDate(isoTimestamp);
  if (!isValid(d)) return isoTimestamp;
  return format(d, 'PPp', { locale });
}

/**
 * Tooltip X-label: full localized date; hourly charts include time to seconds (no sub-second noise).
 */
export function formatStatisticsTooltipLabel(
  value: string | number,
  options: { hourly: boolean; locale: Locale }
): string {
  const s = String(value).trim();
  if (!s) return '';
  const d = parseStatisticsApiDate(s);
  if (!isValid(d)) return s;
  if (options.hourly) {
    return format(d, 'PPpp', { locale: options.locale });
  }
  return format(d, 'PPP', { locale: options.locale });
}
