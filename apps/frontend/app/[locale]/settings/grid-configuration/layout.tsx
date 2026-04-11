import { notFound } from 'next/navigation';
import { routing } from '@/src/i18n/routing';

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageTitles' });

  return {
    title: t('admin.gridConfiguration')
  };
}

export default async function GridConfigurationLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Ensure that the incoming `locale` is valid
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'ru')) {
    notFound();
  }

  // This layout simply passes through children for the grid configuration
  return <div className='container mx-auto p-4'>{children}</div>;
}
