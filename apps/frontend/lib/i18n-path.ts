import { locales } from '@/i18n';

function escapeLocaleSegment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip Next.js `[locale]` prefix from pathname (e.g. `/en/staff` → `/staff`, `/en-US/foo` when `en-US` is configured). */
export function pathWithoutLocale(pathname: string): string {
  const locPattern = (locales as readonly string[])
    .map(escapeLocaleSegment)
    .join('|');
  const re = new RegExp(`^/(?:${locPattern})(?=/|$)`, 'i');
  const stripped = pathname.replace(re, '');
  return stripped === '' ? '/' : stripped;
}
