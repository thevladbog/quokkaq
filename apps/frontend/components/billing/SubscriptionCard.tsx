'use client';

import { useEffect, useMemo, useState } from 'react';
import { Subscription } from '@quokkaq/shared-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Info
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatAppDate, intlLocaleFromAppLocale } from '@/lib/format-datetime';

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
  const locale = useLocale();
  const intlLocale = intlLocaleFromAppLocale(locale);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const getStatusBadge = (status: string) => {
    return (
      <Badge
        variant={
          status === 'trial'
            ? 'secondary'
            : status === 'active'
              ? 'default'
              : status === 'past_due'
                ? 'destructive'
                : 'outline'
        }
      >
        {t(`status.${status}`)}
      </Badge>
    );
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currency
    }).format(price / 100);
  };

  const formatDate = (dateString: string) =>
    formatAppDate(dateString, intlLocale, 'long');

  const daysUntilEnd = useMemo(() => {
    if (!subscription.trialEnd) {
      return 0;
    }
    const raw = Math.ceil(
      (new Date(subscription.trialEnd).getTime() - nowMs) /
        (1000 * 60 * 60 * 24)
    );
    return Math.max(0, raw);
  }, [subscription.trialEnd, nowMs]);

  return (
    <Card className='w-full'>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='text-2xl'>
              {subscription.plan?.name ?? t('planUnknown')}
            </CardTitle>
            <CardDescription>{t('currentPlan')}</CardDescription>
          </div>
          {getStatusBadge(subscription.status)}
        </div>
      </CardHeader>

      <CardContent className='space-y-6'>
        {/* Price */}
        {subscription.plan && subscription.plan.price > 0 && (
          <div className='flex items-baseline gap-2'>
            <span className='text-4xl font-bold'>
              {formatPrice(subscription.plan.price, subscription.plan.currency)}
            </span>
            <span className='text-gray-500'>
              /{' '}
              {subscription.plan.interval === 'month'
                ? t('intervalMonth')
                : t('intervalYear')}
            </span>
          </div>
        )}

        {/* Trial Warning */}
        {subscription.status === 'trial' && subscription.trialEnd && (
          <div className='flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4'>
            <AlertCircle className='mt-0.5 h-5 w-5 text-yellow-600' />
            <div className='flex-1'>
              {daysUntilEnd > 0 ? (
                <>
                  <p className='font-medium text-yellow-900'>
                    {t('trialEnding')}
                  </p>
                  <p className='mt-1 text-sm text-yellow-700'>
                    {t('trialEndingDesc', { days: daysUntilEnd })}
                  </p>
                </>
              ) : (
                <>
                  <p className='font-medium text-yellow-900'>
                    {t('trialExpiredTitle')}
                  </p>
                  <p className='mt-1 text-sm text-yellow-700'>
                    {t('trialExpiredDesc')}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Past Due Warning */}
        {subscription.status === 'past_due' && (
          <div className='flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4'>
            <AlertCircle className='mt-0.5 h-5 w-5 text-red-600' />
            <div className='flex-1'>
              <p className='font-medium text-red-900'>{t('pastDueWarning')}</p>
              <p className='mt-1 text-sm text-red-700'>{t('pastDueDesc')}</p>
            </div>
          </div>
        )}

        {subscription.pendingPlanId && subscription.pendingEffectiveAt && (
          <div className='flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4'>
            <Info className='mt-0.5 h-5 w-5 shrink-0 text-blue-600' />
            <div className='flex-1'>
              <p className='font-medium text-blue-900'>
                {t('pendingPlanChangeTitle')}
              </p>
              <p className='mt-1 text-sm text-blue-800'>
                {t('pendingPlanChangeDesc', {
                  plan:
                    subscription.pendingPlan?.name ??
                    subscription.pendingPlanId,
                  date: new Intl.DateTimeFormat(intlLocale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'UTC'
                  }).format(new Date(subscription.pendingEffectiveAt))
                })}
              </p>
              <p className='mt-1 text-xs text-blue-700/80'>
                {t('pendingPlanChangeUtcNote')}
              </p>
            </div>
          </div>
        )}

        {/* Period Info */}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <div className='flex items-start gap-3'>
            <CalendarDays className='mt-0.5 h-5 w-5 text-gray-400' />
            <div>
              <p className='text-sm text-gray-500'>{t('currentPeriod')}</p>
              <p className='font-medium'>
                {formatDate(subscription.currentPeriodStart)} -{' '}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          </div>

          <div className='flex items-start gap-3'>
            <TrendingUp className='mt-0.5 h-5 w-5 text-gray-400' />
            <div>
              <p className='text-sm text-gray-500'>
                {subscription.cancelAtPeriodEnd
                  ? t('cancelingOn')
                  : t('nextRenewal')}
              </p>
              <p className='font-medium'>
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          </div>
        </div>

        {/* Cancel Warning */}
        {subscription.cancelAtPeriodEnd && (
          <div className='rounded-lg border border-gray-200 bg-gray-50 p-4'>
            <p className='text-sm text-gray-700'>
              {t('cancelWarning', {
                date: formatDate(subscription.currentPeriodEnd)
              })}
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className='flex gap-3'>
        {subscription.status === 'trial' && onManageBilling && (
          <Button onClick={onManageBilling} className='flex-1'>
            <CreditCard className='mr-2 h-4 w-4' />
            {t('addPaymentMethod')}
          </Button>
        )}

        {subscription.status === 'active' &&
          !subscription.cancelAtPeriodEnd &&
          onUpgrade && (
            <Button onClick={onUpgrade} className='flex-1'>
              <TrendingUp className='mr-2 h-4 w-4' />
              {t('upgradePlan')}
            </Button>
          )}

        {subscription.status === 'active' &&
          !subscription.cancelAtPeriodEnd &&
          onCancel && (
            <Button onClick={onCancel} variant='outline' className='flex-1'>
              {t('cancelSubscription')}
            </Button>
          )}

        {subscription.cancelAtPeriodEnd && onManageBilling && (
          <Button onClick={onManageBilling} className='flex-1'>
            {t('manageBilling')}
          </Button>
        )}

        {subscription.status === 'past_due' && onManageBilling && (
          <Button
            onClick={onManageBilling}
            variant='destructive'
            className='flex-1'
          >
            {t('manageBilling')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
