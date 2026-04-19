'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getListInvoicesQueryKey,
  getListSubscriptionPlansQueryKey,
  listInvoices,
  listCompanies,
  listSubscriptions,
  getListCompaniesQueryKey,
  getListSubscriptionsQueryKey,
  listSubscriptionPlans
} from '@/lib/api/generated/platform';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Building2,
  CreditCard,
  FileText,
  Layers
} from 'lucide-react';

const overviewListParams = { limit: 1, offset: 0 } as const;

export default function PlatformOverviewPage() {
  const t = useTranslations('platform.overview');
  const {
    data: companies,
    isLoading: lc,
    isError: isCompaniesError,
    refetch: refetchCompanies
  } = useQuery({
    queryKey: getListCompaniesQueryKey(overviewListParams),
    queryFn: async () => (await listCompanies(overviewListParams)).data
  });
  const {
    data: subs,
    isLoading: ls,
    isError: isSubsError,
    refetch: refetchSubs
  } = useQuery({
    queryKey: getListSubscriptionsQueryKey(overviewListParams),
    queryFn: async () => (await listSubscriptions(overviewListParams)).data
  });
  const {
    data: plans,
    isLoading: lp,
    isError: isPlansError,
    refetch: refetchPlans
  } = useQuery({
    queryKey: getListSubscriptionPlansQueryKey(),
    queryFn: async () => (await listSubscriptionPlans()).data
  });
  const {
    data: inv,
    isLoading: li,
    isError: isInvError,
    refetch: refetchInv
  } = useQuery({
    queryKey: getListInvoicesQueryKey(overviewListParams),
    queryFn: async () => (await listInvoices(overviewListParams)).data
  });

  const loading = lc || ls || lp || li;
  const isAnyError =
    isCompaniesError || isSubsError || isPlansError || isInvError;

  const handleRetry = () => {
    void refetchCompanies();
    void refetchSubs();
    void refetchPlans();
    void refetchInv();
  };

  if (loading) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner className='h-10 w-10' />
      </div>
    );
  }

  if (isAnyError) {
    return (
      <div>
        <h1 className='mb-2 text-3xl font-bold'>
          {t.has('title') ? t('title') : 'Platform'}
        </h1>
        <Alert variant='destructive' className='max-w-xl'>
          <AlertCircle />
          <AlertTitle>{t('loadErrorTitle')}</AlertTitle>
          <AlertDescription className='mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <span>
              {t.has('loadError')
                ? t('loadError')
                : 'Could not load platform overview. Check your connection or try again.'}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={handleRetry}
            >
              {t.has('retry') ? t('retry') : 'Retry'}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const cards = [
    {
      title: t.has('companies') ? t('companies') : 'Companies',
      value: companies?.total ?? 0,
      href: '/platform/companies',
      icon: Building2
    },
    {
      title: t.has('subscriptions') ? t('subscriptions') : 'Subscriptions',
      value: subs?.total ?? 0,
      href: '/platform/subscriptions',
      icon: CreditCard
    },
    {
      title: t.has('plans') ? t('plans') : 'Plans',
      value: plans?.length ?? 0,
      href: '/platform/plans',
      icon: Layers
    },
    {
      title: t.has('invoices') ? t('invoices') : 'Invoices',
      value: inv?.total ?? 0,
      href: '/platform/invoices',
      icon: FileText
    }
  ];

  return (
    <div>
      <h1 className='mb-2 text-3xl font-bold'>
        {t.has('title') ? t('title') : 'Platform'}
      </h1>
      <p className='text-muted-foreground mb-8 max-w-2xl'>
        {t.has('subtitle')
          ? t('subtitle')
          : 'Manage organizations, subscriptions, plans, and manual invoices.'}
      </p>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}>
              <Card className='hover:bg-muted/40 h-full transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>
                    {c.title}
                  </CardTitle>
                  <Icon className='text-muted-foreground h-4 w-4' />
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{c.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
