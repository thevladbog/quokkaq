import { DefaultFormatter } from 'fumadocs-core/i18n/middleware';
import type { NextURL } from 'next/dist/server/web/next-url';

/**
 * Passed to `createI18nMiddleware` (not `defineI18n` — I18nConfig is typed without `format`).
 * Default Fumadocs add() uses `url.basePath` raw; in Next 16+ `NextURL.basePath` is often
 * `undefined`, so the redirect Location becomes a path containing the literal "undefined…".
 */
export const i18nProxyPathFormat = {
  get: DefaultFormatter.get,
  add: (url: NextURL, locale: string) => {
    const next = new URL(url);
    const base = url.basePath ?? '';
    next.pathname = `${base}/${locale}/${url.pathname}`.replaceAll(/\/+/g, '/');
    return next;
  },
  remove: DefaultFormatter.remove
} as const;
