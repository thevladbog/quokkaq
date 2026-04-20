import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { getMetadataBaseUrl } from '@/lib/marketing-site-url';
import { isAppLocale } from '@/src/messages';

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
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const lang = isAppLocale(cookieLocale ?? '') ? cookieLocale : 'en';

  return (
    <html
      lang={lang}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable}`}
    >
      <body className='min-h-dvh antialiased'>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
