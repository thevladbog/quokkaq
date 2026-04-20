import { headers } from 'next/headers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { MARKETING_HTML_LANG_HEADER } from '@/lib/marketing-html-lang-header';
import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { isAppLocale, locales, type AppLocale } from '@/src/messages';

import { fontDisplay, fontSans } from './fonts';
import { Providers } from './providers';

import './globals.css';

const marketingSite = getMetadataBaseUrl();

export const metadata: Metadata = {
  metadataBase: marketingSite,
  title: {
    default: 'QuokkaQ',
    template: '%s | QuokkaQ'
  },
  description: 'QuokkaQ',
  icons: {
    icon: '/favicon.ico'
  }
};

export default async function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  const headerStore = await headers();
  const raw = headerStore.get(MARKETING_HTML_LANG_HEADER) ?? '';
  const lang: AppLocale = isAppLocale(raw) ? raw : locales[0];

  return (
    <html
      lang={lang}
      dir='ltr'
      data-scroll-behavior='smooth'
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable}`}
    >
      <body className='min-h-dvh antialiased'>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
