'use client';

import { useEffect, useMemo, useState } from 'react';
import { Subscription } from '@quokkaq/shared-types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CreditCard, TrendingUp, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useTranslations } from 'next-intl';

interface SubscriptionCardProps {
  subscription: Subscription;
  onUpgrade?: () => void;
  onCancel?: () => void;
  onManageBilling?: () => void;
}

export function SubscriptionCard({ 
  subscription, 
  onUpgrade, 
  onCancel,
  onManageBilling 
}: SubscriptionCardProps) {
  const t = useTranslations('organization.billing');

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const getStatusBadge = (status: string) => {
    return <Badge variant={
      status === 'trial' ? 'secondary' :
      status === 'active' ? 'default' :
      status === 'past_due' ? 'destructive' : 'outline'
    }>{t(`status.${status}`)}</Badge>;
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency
    }).format(price / 100);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMMM yyyy', { locale: ru });
  };

  const daysUntilEnd = useMemo(() => {
    if (!subscription.trialEnd) {
      return 0;
    }
    return Math.ceil(
      (new Date(subscription.trialEnd).getTime() - nowMs) / (1000 * 60 * 60 * 24)
    );
  }, [subscription.trialEnd, nowMs]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">{subscription.plan?.name}</CardTitle>
            <CardDescription>{t('currentPlan')}</CardDescription>
          </div>
          {getStatusBadge(subscription.status)}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Price */}
        {subscription.plan && subscription.plan.price > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">
              {formatPrice(subscription.plan.price, subscription.plan.currency)}
            </span>
            <span className="text-gray-500">/ {subscription.plan.interval === 'month' ? t('perMonth').replace('/', '') : t('perYear').replace('/', '')}</span>
          </div>
        )}

        {/* Trial Warning */}
        {subscription.status === 'trial' && subscription.trialEnd && (
          <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-yellow-900">{t('trialEnding')}</p>
              <p className="text-sm text-yellow-700 mt-1">
                {t('trialEndingDesc', { days: daysUntilEnd })}
              </p>
            </div>
          </div>
        )}

        {/* Past Due Warning */}
        {subscription.status === 'past_due' && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-900">{t('pastDueWarning')}</p>
              <p className="text-sm text-red-700 mt-1">{t('pastDueDesc')}</p>
            </div>
          </div>
        )}

        {/* Period Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CalendarDays className="h-5 w-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500">{t('currentPeriod')}</p>
              <p className="font-medium">
                {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500">
                {subscription.cancelAtPeriodEnd ? t('cancelingOn') : t('nextRenewal')}
              </p>
              <p className="font-medium">
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          </div>
        </div>

        {/* Cancel Warning */}
        {subscription.cancelAtPeriodEnd && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-700">
              {t('cancelWarning', { date: formatDate(subscription.currentPeriodEnd) })}
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-3">
        {subscription.status === 'trial' && onManageBilling && (
          <Button onClick={onManageBilling} className="flex-1">
            <CreditCard className="mr-2 h-4 w-4" />
            {t('addPaymentMethod')}
          </Button>
        )}
        
        {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && onUpgrade && (
          <Button onClick={onUpgrade} className="flex-1">
            <TrendingUp className="mr-2 h-4 w-4" />
            {t('upgradePlan')}
          </Button>
        )}

        {subscription.status === 'active' && !subscription.cancelAtPeriodEnd && onCancel && (
          <Button onClick={onCancel} variant="outline" className="flex-1">
            {t('cancelSubscription')}
          </Button>
        )}

        {subscription.cancelAtPeriodEnd && onManageBilling && (
          <Button onClick={onManageBilling} className="flex-1">
            {t('manageBilling')}
          </Button>
        )}

        {subscription.status === 'past_due' && onManageBilling && (
          <Button onClick={onManageBilling} variant="destructive" className="flex-1">
            {t('manageBilling')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
