import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LegalDocumentView } from '@/components/legal/legal-document-view';
import { LegalBreadcrumbJsonLd } from '@/components/seo/legal-breadcrumb-json-ld';
import {
  buildLocaleAlternates,
  marketingCanonicalUrl,
  ogLocale
} from '@/lib/marketing-metadata';
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
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const alternates = buildLocaleAlternates(raw, ['privacy']);
  const canonicalUrl = marketingCanonicalUrl(raw, ['privacy']);
  return {
    title: page.title,
    description: page.description,
    alternates,
    openGraph: {
      type: 'website',
      title: page.title,
      description: page.description,
      siteName: brand,
      locale: ogLocale(raw),
      alternateLocale: [raw === 'en' ? 'ru_RU' : 'en_US'],
      url: canonicalUrl,
      images: [{ url: `/${raw}/opengraph-image`, width: 1200, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [`/${raw}/opengraph-image`]
    }
  };
}

export default async function PrivacyPage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const copy = legalPages[raw];

  return (
    <>
      <LegalBreadcrumbJsonLd
        locale={raw}
        pageTitle={copy.privacy.title}
        pathSegment='privacy'
      />
      <LegalDocumentView locale={raw} copy={copy} page={copy.privacy} />
    </>
  );
}
