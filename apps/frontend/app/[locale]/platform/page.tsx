'use client';

import { useQuery } from '@tanstack/react-query';
import { platformApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@/src/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Building2, CreditCard, FileText, Layers } from 'lucide-react';

export default function PlatformOverviewPage() {
  const t = useTranslations('platform.overview');
  const { data: companies, isLoading: lc } = useQuery({
    queryKey: ['platform-companies', 'count'],
    queryFn: () => platformApi.listCompanies({ limit: 1, offset: 0 })
  });
  const { data: subs, isLoading: ls } = useQuery({
    queryKey: ['platform-subscriptions', 'count'],
    queryFn: () => platformApi.listSubscriptions({ limit: 1, offset: 0 })
  });
  const { data: plans, isLoading: lp } = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => platformApi.listSubscriptionPlans()
  });
  const { data: inv, isLoading: li } = useQuery({
    queryKey: ['platform-invoices', 'count'],
    queryFn: () => platformApi.listInvoices({ limit: 1, offset: 0 })
  });

  const loading = lc || ls || lp || li;

  if (loading) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner className='h-10 w-10' />
      </div>
    );
  }

  const cards = [
    {
      title: t('companies', { defaultValue: 'Companies' }),
      value: companies?.total ?? 0,
      href: '/platform/companies',
      icon: Building2
    },
    {
      title: t('subscriptions', { defaultValue: 'Subscriptions' }),
      value: subs?.total ?? 0,
      href: '/platform/subscriptions',
      icon: CreditCard
    },
    {
      title: t('plans', { defaultValue: 'Plans' }),
      value: plans?.length ?? 0,
      href: '/platform/plans',
      icon: Layers
    },
    {
      title: t('invoices', { defaultValue: 'Invoices' }),
      value: inv?.total ?? 0,
      href: '/platform/invoices',
      icon: FileText
    }
  ];

  return (
    <div>
      <h1 className='mb-2 text-3xl font-bold'>
        {t('title', { defaultValue: 'Platform' })}
      </h1>
      <p className='text-muted-foreground mb-8 max-w-2xl'>
        {t('subtitle', {
          defaultValue:
            'Manage organizations, subscriptions, plans, and manual invoices.'
        })}
      </p>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}>
              <Card className='hover:bg-muted/40 h-full transition-colors'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>{c.title}</CardTitle>
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
