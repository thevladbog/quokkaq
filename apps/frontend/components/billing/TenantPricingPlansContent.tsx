'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { SubscriptionCard } from '@/components/billing/SubscriptionCard';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { PricingCustomTermsBanner } from '@/components/billing/PricingCustomTermsBanner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiHttpError, subscriptionsApi } from '@/lib/api';
import {
  getGetMySubscriptionQueryKey,
  getGetMySubscriptionPlansQueryKey
} from '@/lib/api/generated/tenant-billing';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '@quokkaq/shared-types';

export function TenantPricingPlansContent() {
  const router = useRouter();
  const t = useTranslations('organization.pricing');
  const tCommon = useTranslations('common');

  const {
    data: subscription,
    isLoading: subscriptionLoading,
    isError: subscriptionQueryError,
    error: subscriptionLoadError
  } = useQuery({
    queryKey: getGetMySubscriptionQueryKey(),
    queryFn: async () => {
      try {
        return await subscriptionsApi.getMySubscription();
      } catch (e) {
        if (e instanceof ApiHttpError && e.status === 404) {
          return null;
        }
        throw e;
      }
    }
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: getGetMySubscriptionPlansQueryKey(),
    queryFn: () => subscriptionsApi.getPlans()
  });

  const planChangeMutation = useMutation({
    mutationFn: (planCode: string) =>
      subscriptionsApi.requestPlanChange(planCode),
    onSuccess: () => {
      toast.success(t('toastRequestCreated'));
    },
    onError: (err: unknown) => {
      if (err instanceof ApiHttpError && err.status === 503) {
        toast.error(t('toastTrackerUnavailable'));
        return;
      }
      toast.error(
        t('toastRequestFailed', {
          message: formatApiToastErrorMessage(err, tCommon('error'))
        })
      );
    }
  });

  const handleManageBilling = () => {
    router.push('/settings/organization/billing/payment-methods');
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (!subscription) {
      toast.error(t('noSubscription'));
      return;
    }
    planChangeMutation.mutate(plan.code);
  };

  if (subscriptionLoading) {
    return <div className='text-muted-foreground'>{tCommon('loading')}</div>;
  }

  if (subscriptionQueryError) {
    return (
      <Alert variant='destructive'>
        <AlertDescription>
          {t('loadSubscriptionFailed')}
          {': '}
          {formatApiToastErrorMessage(subscriptionLoadError, tCommon('error'))}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='text-muted-foreground space-y-2 text-sm leading-snug'>
        <p>{t('pageIntro')}</p>
        <p>
          {t('billingHintPrefix')}{' '}
          <Link
            href='/settings/organization/billing'
            className='text-primary font-medium underline underline-offset-4'
          >
            {t('billingLinkLabel')}
          </Link>
        </p>
      </div>

      {!subscription && (
        <Alert>
          <AlertDescription>{t('noSubscription')}</AlertDescription>
        </Alert>
      )}

      {subscription && (
        <SubscriptionCard
          subscription={subscription}
          onManageBilling={handleManageBilling}
        />
      )}

      <div>
        <h2 className='mb-3 text-xl font-semibold'>{t('availablePlans')}</h2>
        {plansLoading ? (
          <div className='text-muted-foreground'>{t('loadingPlans')}</div>
        ) : (
          <PlanSelector
            plans={plans ?? []}
            currentPlanId={subscription?.planId}
            onSelect={handleSelectPlan}
            isLoading={plansLoading || planChangeMutation.isPending}
            primaryCtaLabel={t('requestPlanChange')}
          />
        )}
      </div>

      <PricingCustomTermsBanner />
    </div>
  );
}
