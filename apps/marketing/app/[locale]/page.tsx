import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  buildLocaleAlternates,
  marketingCanonicalUrl,
  ogLocale
} from '@/lib/marketing-metadata';
import { fetchMarketingPublicStats } from '@/lib/fetch-marketing-public-stats';
import {
  fetchMarketingSubscriptionPlans,
  marketingAppBaseUrl
} from '@/lib/fetch-marketing-subscription-plans';
import { LandingBookDemo } from '@/components/landing/landing-book-demo';
import { LandingComparison } from '@/components/landing/landing-comparison';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LandingFeatures } from '@/components/landing/landing-features';
import { LandingFooterCta } from '@/components/landing/landing-footer-cta';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingIntegrations } from '@/components/landing/landing-integrations';
import { LandingHowItWorks } from '@/components/landing/landing-how-it-works';
import { LandingInterfaceShowcase } from '@/components/landing/landing-interface-showcase';
import { LandingPillars } from '@/components/landing/landing-pillars';
import { LandingPricing } from '@/components/landing/landing-pricing';
import { LandingStats } from '@/components/landing/landing-stats';
import { LandingStickyMobileCta } from '@/components/landing/landing-sticky-mobile-cta';
import { LandingTopBar } from '@/components/landing/landing-top-bar';
import { LandingTrustBadges } from '@/components/landing/landing-trust-badges';
import { LandingUseCases } from '@/components/landing/landing-use-cases';
import { HomePageJsonLd } from '@/components/seo/home-page-json-ld';
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
  const alternates = buildLocaleAlternates(raw, []);
  const canonicalUrl = marketingCanonicalUrl(raw, []);

  return {
    title: {
      absolute: t.title
    },
    description: t.description,
    alternates,
    openGraph: {
      type: 'website',
      title: t.title,
      description: t.description,
      siteName: brand,
      locale: ogLocale(raw),
      alternateLocale: [raw === 'en' ? 'ru_RU' : 'en_US'],
      url: canonicalUrl,
      images: [{ url: `/${raw}/opengraph-image`, width: 1200, height: 630 }]
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.description,
      images: [`/${raw}/opengraph-image`]
    }
  };
}

export default async function HomePage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const t = messages[raw];
  const [plansFromApi, marketingStats] = await Promise.all([
    fetchMarketingSubscriptionPlans(),
    fetchMarketingPublicStats()
  ]);
  const appBaseUrl = marketingAppBaseUrl();
  const walkthroughVideoEmbedSrc =
    process.env.NEXT_PUBLIC_MARKETING_DEMO_VIDEO_EMBED?.trim() || null;

  return (
    <div className='landing-page flex min-h-dvh flex-col'>
      <HomePageJsonLd locale={raw} />
      <LandingTopBar copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
      <main className='relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip'>
        <LandingHero copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
        <LandingIntegrations copy={t.home.integrations} />
        <LandingStats copy={t.home} statsFromApi={marketingStats} />
        <LandingPillars copy={t.home} />
        <LandingHowItWorks copy={t.home} />
        <LandingComparison copy={t.home.comparison} locale={raw} />
        <LandingFeatures copy={t.home} />
        <LandingInterfaceShowcase
          copy={t.home}
          walkthroughVideoEmbedSrc={walkthroughVideoEmbedSrc}
        />
        <LandingUseCases copy={t.home} />
        <LandingBookDemo
          locale={raw}
          copy={t.home}
          appBaseUrl={appBaseUrl}
        />
        <LandingPricing
          copy={t.home}
          locale={raw}
          plansFromApi={plansFromApi}
          appBaseUrl={appBaseUrl}
        />
        <LandingTrustBadges copy={t.home.trust} />
        <LandingFaq copy={t.home} />
        <LandingStickyMobileCta
          locale={raw}
          copy={t.home}
          appBaseUrl={appBaseUrl}
        />
      </main>
      <LandingFooterCta copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
    </div>
  );
}
