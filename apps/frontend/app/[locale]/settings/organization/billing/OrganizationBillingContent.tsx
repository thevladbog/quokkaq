'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SubscriptionCard } from '@/components/billing/SubscriptionCard';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Receipt, ArrowRight } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { SubscriptionPlan } from '@quokkaq/shared-types';
import {
  getGetSubscriptionPlansQueryKey,
  getGetSubscriptionsMeQueryKey
} from '@/lib/api/generated/tenant-billing';
import { subscriptionsApi } from '@/lib/api';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';

export function OrganizationBillingContent() {
  const router = useRouter();
  const t = useTranslations('organization.billing');
  const tCommon = useTranslations('common');
  const tGeneral = useTranslations('general');
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const queryClient = useQueryClient();

  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: getGetSubscriptionsMeQueryKey(),
    queryFn: () => subscriptionsApi.getMySubscription()
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: getGetSubscriptionPlansQueryKey(),
    queryFn: () => subscriptionsApi.getPlans()
  });

  const checkoutMutation = useMutation({
    mutationFn: (planCode: string) => subscriptionsApi.createCheckout(planCode),
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (err: unknown) => {
      toast.error(
        t('toastCheckoutFailed', {
          message: formatApiToastErrorMessage(err, tCommon('error'))
        })
      );
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      subscriptionsApi.cancelSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getGetSubscriptionsMeQueryKey()
      });
      toast.success(t('toastSubscriptionCanceled'));
    },
    onError: (err: unknown) => {
      toast.error(
        t('toastCancelFailed', {
          message: formatApiToastErrorMessage(err, tCommon('error'))
        })
      );
    }
  });

  const handleUpgrade = () => {
    setShowPlanSelector(true);
  };

  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    checkoutMutation.mutate(plan.code);
  };

  const handleCancel = async () => {
    if (subscription && confirm(t('cancelSubscription') + '?')) {
      cancelMutation.mutate(subscription.id);
    }
  };

  const handleManageBilling = () => {
    router.push('/settings/organization/billing/payment-methods');
  };

  if (subscriptionLoading) {
    return <div>{tCommon('loading')}</div>;
  }

  return (
    <div className='space-y-8'>
      {/* Current Subscription */}
      {subscription && !showPlanSelector && (
        <SubscriptionCard
          subscription={subscription}
          onUpgrade={handleUpgrade}
          onCancel={handleCancel}
          onManageBilling={handleManageBilling}
        />
      )}

      {/* Plan Selector */}
      {showPlanSelector && (
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-2xl font-bold'>{t('upgradePlan')}</h2>
            <Button variant='ghost' onClick={() => setShowPlanSelector(false)}>
              {tGeneral('cancel')}
            </Button>
          </div>
          <PlanSelector
            plans={plans || []}
            currentPlanId={subscription?.planId}
            onSelect={handlePlanSelect}
            isLoading={plansLoading}
          />
        </div>
      )}

      {/* Quick Links */}
      <div className='grid gap-4 md:grid-cols-2'>
        <Card
          className='cursor-pointer transition-shadow hover:shadow-lg'
          onClick={() => router.push('/settings/organization/billing/invoices')}
        >
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <Receipt className='h-5 w-5' />
              {t('viewInvoices')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='mb-3 text-sm text-gray-600'>
              {t('viewInvoicesDesc')}
            </p>
            <Button variant='ghost' size='sm' className='h-auto p-0'>
              {t('goTo')} <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          </CardContent>
        </Card>

        <Card
          className='cursor-pointer transition-shadow hover:shadow-lg'
          onClick={() => router.push('/settings/organization/billing/usage')}
        >
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-lg'>
              <CreditCard className='h-5 w-5' />
              {t('viewUsage')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='mb-3 text-sm text-gray-600'>{t('viewUsageDesc')}</p>
            <Button variant='ghost' size='sm' className='h-auto p-0'>
              {t('goTo')} <ArrowRight className='ml-1 h-4 w-4' />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
