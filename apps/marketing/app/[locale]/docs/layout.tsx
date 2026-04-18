import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { getPageMap } from 'nextra/page-map';
import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { TextLogoImg } from '@/components/landing/text-logo-img';
import { MARKETING_THEME_STORAGE_KEY } from '@/app/theme-constants';
import { isAppLocale } from '@/src/messages';

import './docs-nextra-defaults.css';
import 'nextra-theme-docs/style.css';

const docsI18n = [
  { locale: 'en', name: 'English' },
  { locale: 'ru', name: 'Русский' }
] as const;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'rgb(250, 250, 250)' },
    { media: '(prefers-color-scheme: dark)', color: 'rgb(17, 17, 17)' }
  ]
};

export default async function DocsLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const pageMap = await getPageMap(`/${raw}`);

  const navbar = (
    <Navbar
      logo={<TextLogoImg className='h-7 w-auto sm:h-8' locale={raw} />}
      logoLink={`/${raw}`}
      projectLink='https://github.com/thevladbog/quokkaq'
    />
  );

  const footerBrand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const footer = <Footer>{footerBrand}</Footer>;

  return (
    <>
      <Layout
        navbar={navbar}
        pageMap={pageMap}
        footer={footer}
        i18n={[...docsI18n]}
        darkMode
        nextThemes={{
          attribute: 'class',
          defaultTheme: 'system',
          storageKey: MARKETING_THEME_STORAGE_KEY,
          disableTransitionOnChange: true
        }}
      >
        {children}
      </Layout>
    </>
  );
}
