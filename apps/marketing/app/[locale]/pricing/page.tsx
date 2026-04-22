import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LandingFooterCta } from '@/components/landing/landing-footer-cta';
import { LandingPricing } from '@/components/landing/landing-pricing';
import { LandingTopBar } from '@/components/landing/landing-top-bar';
import { PricingPageJsonLd } from '@/components/seo/pricing-page-json-ld';
import {
  fetchMarketingSubscriptionPlans,
  marketingAppBaseUrl
} from '@/lib/fetch-marketing-subscription-plans';
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
  const t = messages[raw].home;
  const brand = raw === 'ru' ? 'КвоккаКю' : 'QuokkaQ';
  const title = t.pricing.heading;
  const description = t.pricing.subheading;
  const alternates = buildLocaleAlternates(raw, ['pricing']);
  const canonicalUrl = marketingCanonicalUrl(raw, ['pricing']);

  return {
    title: { absolute: title },
    description,
    alternates,
    openGraph: {
      type: 'website',
      title,
      description,
      siteName: brand,
      locale: ogLocale(raw),
      alternateLocale: [raw === 'en' ? 'ru_RU' : 'en_US'],
      url: canonicalUrl,
      images: [{ url: `/${raw}/opengraph-image`, width: 1200, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/${raw}/opengraph-image`]
    }
  };
}

export default async function MarketingPricingPage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const t = messages[raw];
  const plansFromApi = await fetchMarketingSubscriptionPlans();
  const appBaseUrl = marketingAppBaseUrl();

  return (
    <div className='landing-page flex min-h-dvh flex-col'>
      <PricingPageJsonLd locale={raw} />
      <LandingTopBar copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
      <main className='relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip'>
        <LandingPricing
          copy={t.home}
          locale={raw}
          plansFromApi={plansFromApi}
          appBaseUrl={appBaseUrl}
        />
      </main>
      <LandingFooterCta copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
    </div>
  );
}
