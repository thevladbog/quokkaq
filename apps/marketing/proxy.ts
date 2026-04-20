import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { MARKETING_HTML_LANG_HEADER } from '@/lib/marketing-html-lang-header';

const LOCALES = new Set(['en', 'ru']);

function resolveLocale(request: NextRequest, pathname: string): string {
  const first = pathname.split('/').filter(Boolean)[0];
  if (first && LOCALES.has(first)) {
    return first;
  }
  const fromCookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (fromCookie && LOCALES.has(fromCookie)) {
    return fromCookie;
  }
  return 'en';
}

/**
 * Next.js 16 proxy: forwards `x-quokkaq-marketing-locale` so root `<html lang>` matches the `[locale]` URL
 * segment (and syncs `NEXT_LOCALE` when the path includes a locale).
 */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const locale = resolveLocale(request, pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(MARKETING_HTML_LANG_HEADER, locale);

  const response = NextResponse.next({
    request: { headers: requestHeaders }
  });

  const first = pathname.split('/').filter(Boolean)[0];
  if (first && LOCALES.has(first)) {
    response.cookies.set('NEXT_LOCALE', first, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
};
