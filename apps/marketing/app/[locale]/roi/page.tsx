import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { LandingFooterCta } from '@/components/landing/landing-footer-cta';
import { LandingRoiCalculator } from '@/components/landing/landing-roi-calculator';
import { LandingTopBar } from '@/components/landing/landing-top-bar';
import { marketingAppBaseUrl } from '@/lib/fetch-marketing-subscription-plans';
import { localeHomePath } from '@/lib/locale-paths';
import {
  buildLocaleAlternates,
  marketingCanonicalUrl,
  ogLocale
} from '@/lib/marketing-metadata';
import { isAppLocale, messages } from '@/src/messages';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    return {};
  }
  const r = messages[raw].roi;
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const alternates = buildLocaleAlternates(raw, ['roi']);
  const canonicalUrl = marketingCanonicalUrl(raw, ['roi']);

  return {
    title: { absolute: `${r.metaTitle} | ${brand}` },
    description: r.metaDescription,
    alternates,
    openGraph: {
      type: 'website',
      title: r.metaTitle,
      description: r.metaDescription,
      siteName: brand,
      locale: ogLocale(raw),
      alternateLocale: [raw === 'en' ? 'ru_RU' : 'en_US'],
      url: canonicalUrl,
      images: [{ url: `/${raw}/opengraph-image`, width: 1200, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title: r.metaTitle,
      description: r.metaDescription,
      images: [`/${raw}/opengraph-image`]
    }
  };
}

export default async function RoiPage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const t = messages[raw];
  const appBaseUrl = marketingAppBaseUrl();

  return (
    <div className='landing-page flex min-h-dvh flex-col'>
      <LandingTopBar copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
      <main className='relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip py-16 sm:py-20'>
        <div className='mx-auto max-w-4xl px-4 sm:px-6 lg:px-8'>
          <Link
            href={localeHomePath(raw)}
            prefetch={false}
            className='focus-ring mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-primary)] underline-offset-4 transition hover:underline'
          >
            <ArrowLeft className='h-4 w-4 shrink-0' aria-hidden />
            {t.roi.backToHome}
          </Link>
          <h1 className='font-display text-4xl font-bold tracking-tight text-[color:var(--color-text)]'>
            {t.roi.heading}
          </h1>
          <p className='mt-4 max-w-2xl text-lg text-[color:var(--color-text-muted)]'>
            {t.roi.subheading}
          </p>
          <div className='mt-12'>
            <LandingRoiCalculator locale={raw} copy={t.roi} />
          </div>
        </div>
      </main>
      <LandingFooterCta copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
    </div>
  );
}
