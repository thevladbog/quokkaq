export const COOKIE_CONSENT_NAME = 'quokkaq_cookie_consent';

/** ~180 days */
export const COOKIE_CONSENT_MAX_AGE_SEC = 180 * 24 * 60 * 60;

export type StoredConsentV1 = {
  v: 1;
  /** When true, Google Tag Manager may load (GA4, Yandex Metrica tags inside container). */
  analytics: boolean;
};

export function parseConsentCookie(
  raw: string | undefined
): StoredConsentV1 | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const j: unknown = JSON.parse(raw);
    if (typeof j !== 'object' || j === null) {
      return null;
    }
    const rec = j as Record<string, unknown>;
    if (rec.v === 1 && typeof rec.analytics === 'boolean') {
      return { v: 1, analytics: rec.analytics };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function serializeConsent(state: StoredConsentV1): string {
  return JSON.stringify(state);
}

/**
 * Read consent from a raw `document.cookie` string (call only in the browser).
 * Keeps parsing in one place for GTM, exit-intent, and other client UI.
 */
export function parseConsentFromRawCookieHeader(
  header: string | undefined
): StoredConsentV1 | null {
  if (!header?.trim()) {
    return null;
  }
  const all = `; ${header}`;
  const key = `; ${COOKIE_CONSENT_NAME}=`;
  const idx = all.indexOf(key);
  if (idx === -1) {
    return null;
  }
  const start = idx + key.length;
  const end = all.indexOf(';', start);
  const value = end === -1 ? all.slice(start) : all.slice(start, end);
  try {
    return parseConsentCookie(decodeURIComponent(value));
  } catch {
    return null;
  }
}
