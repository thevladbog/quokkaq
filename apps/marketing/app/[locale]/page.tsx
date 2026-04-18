import { notFound } from 'next/navigation';

import {
  fetchMarketingSubscriptionPlans,
  marketingAppBaseUrl
} from '@/lib/fetch-marketing-subscription-plans';
import { LandingFaq } from '@/components/landing/landing-faq';
import { LandingFeatures } from '@/components/landing/landing-features';
import { LandingFooterCta } from '@/components/landing/landing-footer-cta';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingHowItWorks } from '@/components/landing/landing-how-it-works';
import { LandingInterfaceShowcase } from '@/components/landing/landing-interface-showcase';
import { LandingPricing } from '@/components/landing/landing-pricing';
import { LandingStats } from '@/components/landing/landing-stats';
import { LandingTopBar } from '@/components/landing/landing-top-bar';
import { LandingUseCases } from '@/components/landing/landing-use-cases';
import { isAppLocale, messages } from '@/src/messages';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: PageProps) {
  const { locale: raw } = await params;
  if (!isAppLocale(raw)) {
    notFound();
  }

  const t = messages[raw];
  const plansFromApi = await fetchMarketingSubscriptionPlans();
  const appBaseUrl = marketingAppBaseUrl();

  return (
    <div className='landing-page flex min-h-dvh flex-col'>
      <LandingTopBar copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
      <main className='relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip'>
        <LandingHero copy={t.home} locale={raw} />
        <LandingStats copy={t.home} />
        <LandingHowItWorks copy={t.home} />
        <LandingFeatures copy={t.home} />
        <LandingInterfaceShowcase copy={t.home} />
        <LandingUseCases copy={t.home} />
        <LandingPricing
          copy={t.home}
          locale={raw}
          plansFromApi={plansFromApi}
          appBaseUrl={appBaseUrl}
        />
        <LandingFaq copy={t.home} />
      </main>
      <LandingFooterCta copy={t.home} locale={raw} appBaseUrl={appBaseUrl} />
    </div>
  );
}
