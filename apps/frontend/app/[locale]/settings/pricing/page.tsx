import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchPublicSubscriptionPlans } from '@/lib/subscription-plans-public';
import {
  buildPricingRowsFromApiPlan,
  subscriptionPlanDisplayName
} from '@quokkaq/subscription-pricing';
import {
  formatPriceMinorUnits,
  formatPriceMinorUnitsAmountOnly
} from '@/lib/format-price';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';
import type { SubscriptionPlan } from '@quokkaq/shared-types';

/** Opens marketing footer CTA anchor where the lead request modal can be triggered (see NEXT_PUBLIC_MARKETING_URL). */
function marketingContactHref(locale: string): string {
  const base = process.env.NEXT_PUBLIC_MARKETING_URL?.trim().replace(/\/$/, '');
  if (base) {
    return `${base}/${locale}#book-demo`;
  }
  return 'mailto:sales@quokkaq.com';
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return {
    title: t('title'),
    description: t('description')
  };
}

type LegacyPricingPlan = {
  code: string;
  name: string;
  price: number | null;
  currency: string;
  interval: 'month' | 'year';
  popular?: boolean;
  features: string[];
  featureValues?: Record<string, number>;
};

const legacyPlans: LegacyPricingPlan[] = [
  {
    code: 'starter',
    name: 'Starter',
    price: 2900,
    currency: 'RUB',
    interval: 'month',
    features: [
      'features.units',
      'features.users',
      'features.tickets',
      'features.services',
      'features.counters',
      'features.realtimeUpdates',
      'features.basicReports',
      'features.emailSupport'
    ],
    featureValues: {
      units: 1,
      users: 5,
      tickets: 1000,
      services: 10,
      counters: 5
    }
  },
  {
    code: 'professional',
    name: 'Professional',
    price: 9900,
    currency: 'RUB',
    interval: 'month',
    popular: true,
    features: [
      'features.units',
      'features.users',
      'features.tickets',
      'features.services',
      'features.counters',
      'features.realtimeUpdates',
      'features.advancedReports',
      'features.emailSupport',
      'features.phoneSupport',
      'features.apiAccess',
      'features.customBranding',
      'features.prioritySupport'
    ],
    featureValues: {
      units: 5,
      users: 20,
      tickets: 10000,
      services: 50,
      counters: 25
    }
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    price: null,
    currency: 'RUB',
    interval: 'month',
    features: [
      'features.unlimitedUnits',
      'features.unlimitedUsers',
      'features.unlimitedTickets',
      'features.unlimitedServices',
      'features.unlimitedCounters',
      'features.realtimeUpdates',
      'features.advancedReports',
      'features.emailSupport',
      'features.phoneSupport',
      'features.apiAccess',
      'features.whiteLabel',
      'features.dedicatedSupport',
      'features.slaGuarantee',
      'features.customIntegrations',
      'features.teamTraining'
    ]
  }
];

/** API plan amounts use `SubscriptionPlanSchema.price` (minor units); see `@quokkaq/shared-types`. */

export default async function PricingPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const intlLocale = intlLocaleFromAppLocale(locale);

  const apiPlans = await fetchPublicSubscriptionPlans();
  const plansFromApi = apiPlans ?? [];

  return (
    <div className='min-h-screen min-w-0 overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto w-full max-w-7xl min-w-0'>
        {/* Header */}
        <div className='mb-16 text-center'>
          <h1 className='mb-4 text-4xl font-bold text-gray-900'>
            {t('pageTitle')}
          </h1>
          <p className='mx-auto max-w-2xl text-xl text-gray-600'>
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Pricing: auto-fit columns — up to 3 in one row when the main area is wide enough; narrower → 2 or 1. pt-7 leaves room for the "popular" badge sitting on the top border. */}
        <div className='mb-12 grid w-full min-w-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-6 pt-7 sm:gap-8'>
          {plansFromApi.length > 0
            ? await Promise.all(
                plansFromApi.map((plan) => (
                  <PricingCardApi
                    key={plan.id}
                    plan={plan}
                    locale={locale}
                    intlLocale={intlLocale}
                  />
                ))
              )
            : await Promise.all(
                legacyPlans.map((plan) => (
                  <PricingCardLegacy
                    key={plan.code}
                    plan={plan}
                    locale={locale}
                    intlLocale={intlLocale}
                  />
                ))
              )}
        </div>

        {/* FAQ Section */}
        <div className='mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-lg'>
          <h2 className='mb-6 text-center text-2xl font-bold text-gray-900'>
            {t('faq.title')}
          </h2>
          <div className='space-y-6'>
            <div>
              <h3 className='mb-2 text-lg font-semibold'>{t('faq.trial.q')}</h3>
              <p className='text-gray-600'>{t('faq.trial.a')}</p>
            </div>
            <div>
              <h3 className='mb-2 text-lg font-semibold'>
                {t('faq.changePlan.q')}
              </h3>
              <p className='text-gray-600'>{t('faq.changePlan.a')}</p>
            </div>
            <div>
              <h3 className='mb-2 text-lg font-semibold'>
                {t('faq.payment.q')}
              </h3>
              <p className='text-gray-600'>{t('faq.payment.a')}</p>
            </div>
            <div>
              <h3 className='mb-2 text-lg font-semibold'>
                {t('faq.limits.q')}
              </h3>
              <p className='text-gray-600'>{t('faq.limits.a')}</p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className='mt-16 min-w-0 text-center'>
          <h2 className='mb-4 text-3xl font-bold text-gray-900'>
            {t('cta.title')}
          </h2>
          <p className='mb-8 text-xl text-gray-600'>{t('cta.subtitle')}</p>
          <div className='mx-auto flex w-full max-w-lg flex-col items-stretch justify-center gap-3 md:max-w-none md:flex-row md:justify-center md:gap-4'>
            <Button className='w-full md:w-auto' size='lg' asChild>
              <Link href={`/${locale}/register`}>{t('cta.tryFree')}</Link>
            </Button>
            <Button
              className='w-full md:w-auto'
              size='lg'
              variant='outline'
              asChild
            >
              <a href='mailto:sales@quokkaq.com'>{t('cta.contactSales')}</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function PricingCardApi({
  plan,
  locale,
  intlLocale
}: {
  plan: SubscriptionPlan;
  locale: string;
  intlLocale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const popular = plan.isPromoted === true;
  const rows = buildPricingRowsFromApiPlan(plan);
  const showPaidPrice = plan.price > 0;
  const salesOnly = plan.allowInstantPurchase === false;
  const showCustomPricingLabel = salesOnly && !showPaidPrice;
  const intervalLabel = plan.interval === 'year' ? t('perYear') : t('perMonth');
  const planTitle = subscriptionPlanDisplayName(plan, locale);
  const enSplitCurrency = locale.startsWith('en') && showPaidPrice;
  const planHeading = enSplitCurrency
    ? `${planTitle}, ${(plan.currency ?? 'RUB').toUpperCase()}`
    : planTitle;

  return (
    <Card
      className={`relative min-w-0 overflow-visible ${popular ? 'z-10 border-2 border-blue-500 shadow-xl' : ''}`}
    >
      {popular && (
        <div className='pointer-events-none absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2'>
          <span className='pointer-events-auto rounded-full bg-blue-500 px-4 py-1 text-sm font-semibold whitespace-nowrap text-white shadow-sm'>
            {t('popularChoice')}
          </span>
        </div>
      )}
      <CardHeader className='pt-8 pb-8 text-center'>
        <CardTitle className='mb-2 text-2xl font-bold break-words'>
          {planHeading}
        </CardTitle>
        <div className='mt-6'>
          {showCustomPricingLabel ? (
            <div className='text-3xl font-bold'>{t('customPricing')}</div>
          ) : (
            <div className='flex max-w-full flex-wrap items-baseline justify-center gap-x-2 gap-y-1 leading-tight'>
              <span
                className={
                  locale.startsWith('en')
                    ? 'text-3xl font-extrabold tabular-nums sm:text-4xl xl:text-5xl'
                    : 'text-3xl font-extrabold tabular-nums sm:text-4xl xl:text-5xl'
                }
              >
                {enSplitCurrency
                  ? formatPriceMinorUnitsAmountOnly(
                      plan.price,
                      plan.currency,
                      intlLocale
                    )
                  : formatPriceMinorUnits(
                      plan.price,
                      plan.currency,
                      intlLocale
                    )}
              </span>
              <span className='shrink-0 text-sm font-medium text-gray-500'>
                {intervalLabel}
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        <ul className='space-y-3'>
          {rows.map((row) => (
            <li key={row.rowKey} className='flex items-start'>
              <Check className='mt-0.5 mr-3 h-5 w-5 flex-shrink-0 text-green-500' />
              <span className='text-gray-700'>
                {row.count !== undefined
                  ? t(row.translationKey as Parameters<typeof t>[0], {
                      count: row.count
                    })
                  : t(row.translationKey as Parameters<typeof t>[0])}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          className='w-full'
          variant={popular ? 'default' : 'outline'}
          size='lg'
          asChild
        >
          <Link
            href={
              salesOnly
                ? marketingContactHref(locale)
                : `/${locale}/signup?plan=${encodeURIComponent(plan.code)}`
            }
          >
            {salesOnly
              ? t('contactUs')
              : showPaidPrice
                ? t('startTrial')
                : t('cta.tryFree')}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

async function PricingCardLegacy({
  plan,
  locale,
  intlLocale
}: {
  plan: LegacyPricingPlan;
  locale: string;
  intlLocale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'pricing' });
  return (
    <Card
      className={`relative min-w-0 overflow-visible ${plan.popular ? 'z-10 border-2 border-blue-500 shadow-xl' : ''}`}
    >
      {plan.popular && (
        <div className='pointer-events-none absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2'>
          <span className='pointer-events-auto rounded-full bg-blue-500 px-4 py-1 text-sm font-semibold whitespace-nowrap text-white shadow-sm'>
            {t('popularChoice')}
          </span>
        </div>
      )}
      <CardHeader className='pt-8 pb-8 text-center'>
        <CardTitle className='mb-2 text-2xl font-bold break-words'>
          {plan.name}
        </CardTitle>
        <div className='mt-6'>
          {plan.price != null ? (
            <div className='flex flex-wrap items-baseline justify-center gap-x-1'>
              <span className='text-3xl font-extrabold tabular-nums sm:text-4xl xl:text-5xl'>
                {plan.price.toLocaleString(intlLocale)}
              </span>
              <span className='ml-2 text-2xl font-medium text-gray-500'>₽</span>
              <span className='ml-2 text-gray-500'>
                {plan.interval === 'year' ? t('perYear') : t('perMonth')}
              </span>
            </div>
          ) : (
            <div className='text-3xl font-bold'>{t('customPricing')}</div>
          )}
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        <ul className='space-y-3'>
          {plan.features.map((featureKey) => {
            const key = featureKey.split('.').pop() || featureKey;
            const value =
              plan.featureValues?.[
                key as keyof NonNullable<typeof plan.featureValues>
              ];
            return (
              <li key={featureKey} className='flex items-start'>
                <Check className='mt-0.5 mr-3 h-5 w-5 flex-shrink-0 text-green-500' />
                <span className='text-gray-700'>
                  {value !== undefined
                    ? t(featureKey as Parameters<typeof t>[0], { count: value })
                    : t(featureKey as Parameters<typeof t>[0])}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          className='w-full'
          variant={plan.popular ? 'default' : 'outline'}
          size='lg'
          asChild
        >
          <Link
            href={
              plan.price != null
                ? `/${locale}/signup?plan=${encodeURIComponent(plan.code)}`
                : marketingContactHref(locale)
            }
          >
            {plan.price != null ? t('startTrial') : t('contactUs')}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
