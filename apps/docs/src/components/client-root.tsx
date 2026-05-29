'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useLayoutEffect } from 'react';
import { i18nUI } from '@/lib/layout.shared';
import { isAppLocale, type AppLocale } from '@/lib/i18n';

type Props = {
  children: ReactNode;
  /** Validated app locale (from server layout) */
  locale: AppLocale;
  className: string;
};

/**
 * Fumadocs root + i18n; keeps document lang in sync and switches locale in the current path.
 */
export function ClientRoot({ children, locale, className }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? `/${locale}`;

  useLayoutEffect(() => {
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <div className={className}>
      <RootProvider
        i18n={{
          ...i18nUI.provider(locale),
          onLocaleChange: (next) => {
            if (!isAppLocale(next)) return;
            const parts = pathname.split('/').filter(Boolean);
            if (parts.length > 0 && isAppLocale(parts[0])) {
              parts[0] = next;
              const path = `/${parts.join('/')}`;
              router.push(path);
            } else {
              router.push(`/${next}/docs`);
            }
          }
        }}
      >
        {children}
      </RootProvider>
    </div>
  );
}
