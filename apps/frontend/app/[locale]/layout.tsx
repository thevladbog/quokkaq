import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '../../src/i18n/routing';
import ConditionalLayout from '@/components/ConditionalLayout';
import { AuthProvider } from '@/contexts/AuthContext';
import type { Metadata } from 'next';

import SystemStatusGuard from '@/components/SystemStatusGuard';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pageTitles' });

  return {
    title: t('home')
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  // Ensure that the incoming `locale` is valid
  const { locale } = await params;
  if (!routing.locales.includes(locale as 'en' | 'ru')) {
    notFound();
  }

  // Getting messages for the requested locale (force rebuild)
  const messages = await getMessages();

  // Create a wrapper component that includes the client provider
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthProvider>
        <SystemStatusGuard>
          <ConditionalLayout>{children}</ConditionalLayout>
        </SystemStatusGuard>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
