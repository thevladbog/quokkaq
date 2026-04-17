/** Path helpers for the operational support FAB (locale strip + route allowlist). */

export { pathWithoutLocale } from '@/lib/i18n-path';

function isExactOrSubpath(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function shouldShowOperationalSupportFab(normalized: string): boolean {
  if (isExactOrSubpath('/settings', normalized)) return false;
  if (isExactOrSubpath('/platform', normalized)) return false;
  if (isExactOrSubpath('/staff', normalized)) return true;
  if (isExactOrSubpath('/supervisor', normalized)) return true;
  if (isExactOrSubpath('/statistics', normalized)) return true;
  if (isExactOrSubpath('/pre-registrations', normalized)) return true;
  if (isExactOrSubpath('/journal', normalized)) return true;
  if (isExactOrSubpath('/clients', normalized)) return true;
  if (isExactOrSubpath('/onboarding', normalized)) return true;
  return false;
}
