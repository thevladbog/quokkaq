import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchPublicSubscriptionPlans } from '@/lib/subscription-plans-public';
import { buildPricingRowsFromApiPlan } from '@/lib/pricing-plan-rows';
import type { SubscriptionPlan } from '@quokkaq/shared-types';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
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
    featureValues: { units: 1, users: 5, tickets: 1000, services: 10, counters: 5 }
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
    featureValues: { units: 5, users: 20, tickets: 10000, services: 50, counters: 25 }
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

function formatApiPrice(amountMinor: number, currency: string, intlLocale: string): string {
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricing' });
  const intlLocale = locale.startsWith('ru') ? 'ru-RU' : 'en-US';

  const apiPlans = await fetchPublicSubscriptionPlans();
  const plansFromApi = apiPlans ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {t('pageTitle')}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {t('pageSubtitle')}
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plansFromApi.length > 0
            ? await Promise.all(
                plansFromApi.map((plan) => (
                  <PricingCardApi key={plan.id} plan={plan} locale={locale} intlLocale={intlLocale} />
                ))
              )
            : await Promise.all(
                legacyPlans.map((plan) => (
                  <PricingCardLegacy key={plan.code} plan={plan} locale={locale} intlLocale={intlLocale} />
                ))
              )}
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            {t('faq.title')}
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg mb-2">{t('faq.trial.q')}</h3>
              <p className="text-gray-600">{t('faq.trial.a')}</p>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">{t('faq.changePlan.q')}</h3>
              <p className="text-gray-600">{t('faq.changePlan.a')}</p>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">{t('faq.payment.q')}</h3>
              <p className="text-gray-600">{t('faq.payment.a')}</p>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">{t('faq.limits.q')}</h3>
              <p className="text-gray-600">{t('faq.limits.a')}</p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            {t('cta.subtitle')}
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href={`/${locale}/register`}>{t('cta.tryFree')}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="mailto:sales@quokkaq.com">{t('cta.contactSales')}</a>
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
  const popular = plan.code === 'professional';
  const rows = buildPricingRowsFromApiPlan(plan);
  const isPaid = plan.price > 0;
  const intervalLabel = plan.interval === 'year' ? t('perYear') : t('perMonth');

  return (
    <Card className={`relative ${popular ? 'border-blue-500 border-2 shadow-xl' : ''}`}>
      {popular && (
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
            {t('popularChoice')}
          </span>
        </div>
      )}

      <CardHeader className="text-center pb-8 pt-8">
        <CardTitle className="text-2xl font-bold mb-2">{plan.name}</CardTitle>
        <div className="mt-6">
          {isPaid ? (
            <div className="flex items-baseline justify-center flex-wrap gap-x-1">
              <span className="text-5xl font-extrabold">{formatApiPrice(plan.price, plan.currency, intlLocale)}</span>
              <span className="text-gray-500 ml-2">{intervalLabel}</span>
            </div>
          ) : (
            <div className="text-3xl font-bold">{t('customPricing')}</div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.rowKey} className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">
                {row.count !== undefined
                  ? t(row.translationKey as Parameters<typeof t>[0], { count: row.count })
                  : t(row.translationKey as Parameters<typeof t>[0])}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        <Button className="w-full" variant={popular ? 'default' : 'outline'} size="lg" asChild>
          <Link
            href={
              isPaid
                ? `/${locale}/signup?plan=${encodeURIComponent(plan.code)}`
                : `/${locale}/contact`
            }
          >
            {isPaid ? t('startTrial') : t('contactUs')}
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
    <Card className={`relative ${plan.popular ? 'border-blue-500 border-2 shadow-xl' : ''}`}>
      {plan.popular && (
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
            {t('popularChoice')}
          </span>
        </div>
      )}

      <CardHeader className="text-center pb-8 pt-8">
        <CardTitle className="text-2xl font-bold mb-2">{plan.name}</CardTitle>
        <div className="mt-6">
          {plan.price != null ? (
            <div className="flex items-baseline justify-center">
              <span className="text-5xl font-extrabold">
                {plan.price.toLocaleString(intlLocale)}
              </span>
              <span className="text-2xl font-medium text-gray-500 ml-2">₽</span>
              <span className="text-gray-500 ml-2">{plan.interval === 'year' ? t('perYear') : t('perMonth')}</span>
            </div>
          ) : (
            <div className="text-3xl font-bold">{t('customPricing')}</div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {plan.features.map((featureKey) => {
            const key = featureKey.split('.').pop() || featureKey;
            const value = plan.featureValues?.[key as keyof NonNullable<typeof plan.featureValues>];
            return (
              <li key={featureKey} className="flex items-start">
                <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
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
          className="w-full"
          variant={plan.popular ? 'default' : 'outline'}
          size="lg"
          asChild
        >
          <Link
            href={
              plan.price != null
                ? `/${locale}/signup?plan=${encodeURIComponent(plan.code)}`
                : `/${locale}/contact`
            }
          >
            {plan.price != null ? t('startTrial') : t('contactUs')}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
