import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isAppLocale } from '@/lib/i18n';
import { ClientRoot } from '@/components/client-root';
import { fontDisplay, fontSans } from '@/app/fonts';
import { cn } from '@/lib/cn';

const siteUrl =
  process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? 'http://localhost:3020';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'QuokkaQ Docs', template: '%s | QuokkaQ' },
  description: 'QuokkaQ documentation: integrations, APIs, and digital signage.'
};

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
  return (
    <ClientRoot
      className={cn(
        'min-h-dvh flex-1',
        fontSans.variable,
        fontDisplay.variable
      )}
      locale={raw}
    >
      {children}
    </ClientRoot>
  );
}
