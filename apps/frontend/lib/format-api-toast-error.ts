import { ApiHttpError } from '@/lib/api';

const API_ERROR_PREFIX = /^API Error: \d+ - /;
const MAX_TOAST_LEN = 280;

function truncateToastText(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.length > MAX_TOAST_LEN ? `${t.slice(0, MAX_TOAST_LEN)}…` : t;
}

/**
 * User-facing toast text: prefers ApiHttpError.message, JSON `message` inside legacy API Error strings,
 * then a trimmed Error.message; avoids dumping huge raw payloads.
 */
export function formatApiToastErrorMessage(
  err: unknown,
  fallback: string
): string {
  if (err instanceof ApiHttpError) {
    const m = err.message.trim();
    if (!m) return fallback;
    return truncateToastText(m);
  }
  if (err instanceof Error) {
    const raw = err.message.trim();
    if (!raw) return fallback;
    if (API_ERROR_PREFIX.test(raw)) {
      const jsonPart = raw.replace(API_ERROR_PREFIX, '').trim();
      try {
        const j = JSON.parse(jsonPart) as { message?: unknown };
        if (typeof j.message === 'string' && j.message.trim()) {
          return truncateToastText(j.message);
        }
      } catch {
        /* not JSON */
      }
      return fallback;
    }
    if (raw.length > 280) {
      return `${raw.slice(0, 280)}…`;
    }
    return raw;
  }
  if (typeof err === 'string') {
    const s = err.trim();
    if (s) return s.length > 280 ? `${s.slice(0, 280)}…` : s;
  }
  try {
    const s = JSON.stringify(err);
    if (s && s !== '{}' && s !== 'null' && s !== 'undefined') {
      return s.length > 280 ? `${s.slice(0, 280)}…` : s;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}
