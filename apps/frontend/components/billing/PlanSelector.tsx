'use client';

import { SubscriptionPlan } from '@quokkaq/shared-types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

interface PlanSelectorProps {
  plans: SubscriptionPlan[];
  currentPlanId?: string;
  onSelect: (plan: SubscriptionPlan) => void;
  isLoading?: boolean;
}

export function PlanSelector({ plans, currentPlanId, onSelect, isLoading }: PlanSelectorProps) {
  const locale = useLocale();
  const t = useTranslations('organization.billing.planSelector');
  const tBilling = useTranslations('organization.billing');

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency
    }).format(price / 100);
  };

  const getFeaturesList = (features: Record<string, boolean> | undefined) => {
    if (!features) return [];
    return Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([key]) => {
        const k = `features.${key}` as Parameters<typeof t>[0];
        if (t.has(k)) {
          return t(k);
        }
        return key;
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
        label,
        value: formatLimit(value)
      };
    });
  };

  const isCurrentPlan = (planId: string) => planId === currentPlanId;
  const isPopular = (code: string) => code === 'professional';

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {plans
        .filter((plan) => plan.code !== 'grandfathered')
        .map((plan) => (
          <Card
            key={plan.id}
            className={`relative ${isPopular(plan.code) ? 'border-blue-500 border-2 shadow-xl' : ''} ${isCurrentPlan(plan.id) ? 'bg-blue-50' : ''}`}
          >
            {isPopular(plan.code) && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <Badge className="bg-blue-500">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {t('popularBadge')}
                </Badge>
              </div>
            )}

            {isCurrentPlan(plan.id) && (
              <div className="absolute top-4 right-4">
                <Badge variant="outline">{t('currentPlan')}</Badge>
              </div>
            )}

            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <div className="mt-4">
                {plan.price > 0 ? (
                  <div className="flex items-baseline">
                    <span className="text-4xl font-bold">
                      {formatPrice(plan.price, plan.currency)}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {plan.interval === 'month' ? tBilling('perMonth') : tBilling('perYear')}
                    </span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold">{t('customPricing')}</div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">{t('limitsTitle')}</p>
                <ul className="space-y-1">
                  {getLimitsText(plan.limits).map((limit, index) => (
                    <li key={index} className="text-sm text-gray-600">
                      <span className="font-medium">{limit.value}</span> {limit.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">{t('featuresTitle')}</p>
                <ul className="space-y-2">
                  {getFeaturesList(plan.features)
                    .slice(0, 6)
                    .map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </CardContent>

            <CardFooter>
              {!isCurrentPlan(plan.id) ? (
                <Button
                  onClick={() => onSelect(plan)}
                  disabled={isLoading}
                  className="w-full"
                  variant={isPopular(plan.code) ? 'default' : 'outline'}
                >
                  {plan.price > 0 ? t('selectPlan') : t('contactUs')}
                </Button>
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  {t('currentPlan')}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
    </div>
  );
}
