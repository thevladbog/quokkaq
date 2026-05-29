import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import type { NextFetchEvent } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { docsContentRoute, docsRoute } from '@/lib/shared';
import { i18n } from '@/lib/i18n';
import { i18nProxyPathFormat } from '@/lib/i18n-proxy-format';

// Fumadocs i18n is a 1-arg handler; Next 16 types `proxy` with a second `event` arg.
const intl = createI18nMiddleware({
  ...i18n,
  format: i18nProxyPathFormat
}) as unknown as (request: NextRequest) => NextResponse;

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.mdx`,
  `${docsContentRoute}{/*path}/content.md`
);

function stripLocale(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const [maybeLocale, ...pathSegs] = segments;
  if (maybeLocale !== 'en' && maybeLocale !== 'ru') {
    return { locale: undefined as undefined, rest: pathname };
  }
  const rest = pathSegs.length ? `/${pathSegs.join('/')}` : '/';
  return { locale: maybeLocale as 'en' | 'ru', rest };
}

function withLocalePath(locale: string, target: string) {
  if (!target.startsWith('/')) {
    return `/${locale}/${target}`;
  }
  return `/${locale}${target}`;
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  void event;
  const intlRes = intl(request);
  if (intlRes.status >= 300 && intlRes.status < 400) {
    return intlRes;
  }
  if (intlRes.headers.get('location')) {
    return intlRes;
  }

  const { locale, rest: subPath } = stripLocale(request.nextUrl.pathname);
  if (!locale) {
    return intlRes;
  }

  const result = rewriteSuffix(subPath);
  if (result) {
    return NextResponse.rewrite(
      new URL(withLocalePath(locale, result), request.nextUrl)
    );
  }
  if (isMarkdownPreferred(request)) {
    const r2 = rewriteDocs(subPath);
    if (r2) {
      return NextResponse.rewrite(
        new URL(withLocalePath(locale, r2), request.nextUrl)
      );
    }
  }
  return intlRes;
}

// A bare `/(.*)` often does not match `/`, so locale redirect never ran. Include `/` so `/` → `/en` (or `Accept-Language`).
export const config = {
  matcher: ['/', '/((?!_next|api|.*\\..*).*)']
};
