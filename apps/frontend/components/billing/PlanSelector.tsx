'use client';

import { SubscriptionPlan } from '@quokkaq/shared-types';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

export const PLAN_CODES = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
  GRANDFATHERED: 'grandfathered'
} as const;

interface PlanSelectorProps {
  plans: SubscriptionPlan[];
  currentPlanId?: string;
  onSelect: (plan: SubscriptionPlan) => void;
  isLoading?: boolean;
}

export function PlanSelector({
  plans,
  currentPlanId,
  onSelect,
  isLoading
}: PlanSelectorProps) {
  const locale = useLocale();
  const t = useTranslations('organization.billing.planSelector');
  const tBilling = useTranslations('organization.billing');

  const formatPrice = (price: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency
      }).format(price / 100);
    } catch {
      return `${(price / 100).toFixed(2)} ${currency}`;
    }
  };

  const getFeaturesList = (features: Record<string, boolean> | undefined) => {
    if (!features) return [];
    return Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([key]) => {
        const k = `features.${key}` as Parameters<typeof t>[0];
        const text = t.has(k) ? t(k) : key;
        return { key: `feature-${key}`, text };
      });
  };

  const getLimitsText = (limits: Record<string, number> | undefined) => {
    if (!limits) return [];

    const formatLimit = (value: number) =>
      value === -1 ? t('limits.unlimited') : value.toString();

    return Object.entries(limits).map(([key, value]) => {
      const k = `limits.${key}` as Parameters<typeof t>[0];
      const label = t.has(k) ? t(k) : key;
      return {
        key: `limit-${key}-${value}`,
        label,
        value: formatLimit(value)
      };
    });
  };

  const isCurrentPlan = (planId: string) => planId === currentPlanId;
  const isPopular = (code: string) => code === PLAN_CODES.PROFESSIONAL;

  return (
    <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
      {plans
        .filter((plan) => plan.code !== PLAN_CODES.GRANDFATHERED)
        .map((plan) => (
          <Card
            key={plan.id}
            className={`relative ${isPopular(plan.code) ? 'border-2 border-blue-500 shadow-xl' : ''} ${isCurrentPlan(plan.id) ? 'bg-blue-50' : ''}`}
          >
            {isPopular(plan.code) && (
              <div className='absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 transform'>
                <Badge className='bg-blue-500'>
                  <Sparkles className='mr-1 h-3 w-3' />
                  {t('popularBadge')}
                </Badge>
              </div>
            )}

            {isCurrentPlan(plan.id) && (
              <div className='absolute top-4 right-4'>
                <Badge variant='outline'>{t('currentPlan')}</Badge>
              </div>
            )}

            <CardHeader className='pb-4'>
              <CardTitle className='text-2xl'>{plan.name}</CardTitle>
              <div className='mt-4'>
                {plan.price > 0 ? (
                  <div className='flex items-baseline'>
                    <span className='text-4xl font-bold'>
                      {formatPrice(plan.price, plan.currency)}
                    </span>
                    <span className='ml-2 text-gray-500'>
                      {plan.interval === 'month'
                        ? tBilling('perMonth')
                        : tBilling('perYear')}
                    </span>
                  </div>
                ) : (
                  <div className='text-2xl font-bold'>{t('customPricing')}</div>
                )}
              </div>
            </CardHeader>

            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <p className='text-sm font-semibold text-gray-700'>
                  {t('limitsTitle')}
                </p>
                <ul className='space-y-1'>
                  {getLimitsText(plan.limits).map((limit) => (
                    <li key={limit.key} className='text-sm text-gray-600'>
                      <span className='font-medium'>{limit.value}</span>{' '}
                      {limit.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className='space-y-2'>
                <p className='text-sm font-semibold text-gray-700'>
                  {t('featuresTitle')}
                </p>
                <ul className='space-y-2'>
                  {(() => {
                    const all = getFeaturesList(plan.features);
                    const head = all.slice(0, 6);
                    const rest = all.length - head.length;
                    return (
                      <>
                        {head.map((feature) => (
                          <li
                            key={feature.key}
                            className='flex items-start gap-2 text-sm'
                          >
                            <Check className='mt-0.5 h-4 w-4 flex-shrink-0 text-green-500' />
                            <span>{feature.text}</span>
                          </li>
                        ))}
                        {rest > 0 ? (
                          <li className='pl-6 text-sm text-gray-500'>
                            {t('moreFeatures', { count: rest })}
                          </li>
                        ) : null}
                      </>
                    );
                  })()}
                </ul>
              </div>
            </CardContent>

            <CardFooter>
              {!isCurrentPlan(plan.id) ? (
                <Button
                  type='button'
                  onClick={() => onSelect(plan)}
                  disabled={isLoading}
                  className='w-full'
                  variant={isPopular(plan.code) ? 'default' : 'outline'}
                >
                  {plan.price > 0 ? t('selectPlan') : t('contactUs')}
                </Button>
              ) : (
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  disabled
                >
                  {t('currentPlan')}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
    </div>
  );
}
