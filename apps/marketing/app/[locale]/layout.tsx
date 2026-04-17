import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { isAppLocale, locales } from '@/src/messages';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
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
