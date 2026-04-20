export const COOKIE_CONSENT_NAME = 'quokkaq_cookie_consent';

/** ~180 days */
export const COOKIE_CONSENT_MAX_AGE_SEC = 180 * 24 * 60 * 60;

export type StoredConsentV1 = {
  v: 1;
  /** When true, Google Tag Manager may load (GA4, Yandex Metrica tags inside container). */
  analytics: boolean;
};

export function parseConsentCookie(raw: string | undefined): StoredConsentV1 | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const j = JSON.parse(raw) as StoredConsentV1;
    if (j.v === 1 && typeof j.analytics === 'boolean') {
      return j;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function serializeConsent(state: StoredConsentV1): string {
  return JSON.stringify(state);
}
