import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LegalDocumentView } from '@/components/legal/legal-document-view';
import { legalPages } from '@/src/legal-pages';
import { isAppLocale } from '@/src/messages';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const resolved = await params;
  const raw = resolved?.locale;
  if (!raw || !isAppLocale(raw)) {
    return {};
  }
  const page = legalPages[raw].privacy;
  return {
    title: page.title,
    description: page.description
  };
}

export default async function PrivacyPage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const copy = legalPages[raw];

  return <LegalDocumentView locale={raw} copy={copy} page={copy.privacy} />;
}
