import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { isAppLocale, locales } from '@/src/messages';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params?: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const resolved = params ? await params : undefined;
  const raw = resolved?.locale;
  if (!raw || !isAppLocale(raw)) {
    return {};
  }
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  return {
    title: {
      default: brand,
      template: `%s | ${brand}`
    },
    description: brand
  };
}

export default async function LocaleLayout({
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

  return children;
}
