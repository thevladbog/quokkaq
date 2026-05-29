import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { isAppLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';

export default async function HomeZoneLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  return <HomeLayout {...baseOptions(locale)}>{children}</HomeLayout>;
}
