import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { proxy as nextraLocaleProxy } from 'nextra/locales';

/**
 * Локаль без префикса → редирект по cookie или Accept-Language (nextra).
 * Явный выбор языка сохраняется в cookie через этот же proxy и в localStorage на клиенте.
 */
export default function proxy(request: NextRequest) {
  const out = nextraLocaleProxy(request);
  return out ?? NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
};
