import { MARKETING_LOCALE_STORAGE_KEY } from '@/app/theme-constants';
import type { AppLocale } from '@/src/messages';

const COOKIE = 'NEXT_LOCALE';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function isStoredLocale(v: string | null): v is AppLocale {
  return v === 'en' || v === 'ru';
}

export function readStoredMarketingLocale(): AppLocale | null {
  try {
    const raw = localStorage.getItem(MARKETING_LOCALE_STORAGE_KEY);
    if (isStoredLocale(raw)) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredMarketingLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(MARKETING_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${COOKIE}=${locale};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
  } catch {
    /* ignore */
  }
}
