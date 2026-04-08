'use client';

import { SubscriptionPlan } from '@quokkaq/shared-types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles } from 'lucide-react';

interface PlanSelectorProps {
  plans: SubscriptionPlan[];
  currentPlanId?: string;
  onSelect: (plan: SubscriptionPlan) => void;
  isLoading?: boolean;
}

export function PlanSelector({ plans, currentPlanId, onSelect, isLoading }: PlanSelectorProps) {
  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency
    }).format(price / 100);
  };

  const getFeaturesList = (features: Record<string, boolean> | undefined) => {
    if (!features) return [];
    return Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([key]) => {
        const labels: Record<string, string> = {
          websocket_updates: 'Обновления в реальном времени',
          basic_reports: 'Базовые отчеты',
          advanced_reports: 'Продвинутая аналитика',
          email_support: 'Email поддержка',
          phone_support: 'Телефонная поддержка',
          api_access: 'API доступ',
          white_label: 'White-label решение',
          custom_branding: 'Кастомная раскраска',
          priority_support: 'Приоритетная поддержка',
          dedicated_support: 'Выделенный менеджер',
          sla_guarantee: 'SLA гарантия',
          custom_integrations: 'Кастомные интеграции'
        };
        return labels[key] || key;
      });
  };

  const getLimitsText = (limits: Record<string, number> | undefined) => {
    if (!limits) return [];
    
    const formatLimit = (value: number) => value === -1 ? 'Безлимитно' : value.toString();
    
    const labels: Record<string, string> = {
      units: 'Подразделений',
      users: 'Пользователей',
      tickets_per_month: 'Талонов в месяц',
      services: 'Услуг',
      counters: 'Окон'
    };

    return Object.entries(limits).map(([key, value]) => ({
      label: labels[key] || key,
      value: formatLimit(value)
    }));
  };

  const isCurrentPlan = (planId: string) => planId === currentPlanId;
  const isPopular = (code: string) => code === 'professional';

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {plans
        .filter(plan => plan.code !== 'grandfathered') // Don't show grandfathered
        .map((plan) => (
        <Card 
          key={plan.id}
          className={`relative ${isPopular(plan.code) ? 'border-blue-500 border-2 shadow-xl' : ''} ${isCurrentPlan(plan.id) ? 'bg-blue-50' : ''}`}
        >
          {isPopular(plan.code) && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <Badge className="bg-blue-500">
                <Sparkles className="h-3 w-3 mr-1" />
                Популярный выбор
              </Badge>
            </div>
          )}

          {isCurrentPlan(plan.id) && (
            <div className="absolute top-4 right-4">
              <Badge variant="outline">Текущий план</Badge>
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
                    /{plan.interval === 'month' ? 'мес' : 'год'}
                  </span>
                </div>
              ) : (
                <div className="text-2xl font-bold">По запросу</div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Limits */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Лимиты:</p>
              <ul className="space-y-1">
                {getLimitsText(plan.limits).map((limit, index) => (
                  <li key={index} className="text-sm text-gray-600">
                    <span className="font-medium">{limit.value}</span> {limit.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* Features */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Возможности:</p>
              <ul className="space-y-2">
                {getFeaturesList(plan.features).slice(0, 6).map((feature, index) => (
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
                {plan.price > 0 ? 'Выбрать план' : 'Связаться с нами'}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                Текущий план
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
