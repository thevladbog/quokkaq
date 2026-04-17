/** Path helpers for the operational support FAB (locale strip + route allowlist). */

export { pathWithoutLocale } from '@/lib/i18n-path';

export function shouldShowOperationalSupportFab(normalized: string): boolean {
  if (normalized.startsWith('/settings')) return false;
  if (normalized.startsWith('/platform')) return false;
  if (normalized.startsWith('/staff')) return true;
  if (normalized.startsWith('/supervisor')) return true;
  if (normalized === '/statistics' || normalized.startsWith('/statistics/'))
    return true;
  if (normalized.startsWith('/pre-registrations')) return true;
  if (normalized.startsWith('/journal')) return true;
  if (normalized.startsWith('/clients')) return true;
  if (normalized === '/onboarding' || normalized.startsWith('/onboarding/'))
    return true;
  return false;
}
