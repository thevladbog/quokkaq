'use client';

import { useQuery } from '@tanstack/react-query';
import { UsageMetrics } from '@/components/billing/UsageMetrics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Download, TrendingUp } from 'lucide-react';
import { useRouter } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatAppDate, intlLocaleFromAppLocale } from '@/lib/format-datetime';
import { companiesApi } from '@/lib/api';

export function OrganizationUsageContent() {
  const router = useRouter();
  const t = useTranslations('organization.usage');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);

  const { data: usageMetrics, isLoading } = useQuery({
    queryKey: ['usage-metrics-me'],
    queryFn: () => companiesApi.getMyUsageMetrics()
  });

  const handleExportUsage = () => {
    if (!usageMetrics) return;

    // Prepare CSV data
    const headers = ['Metric', 'Current Usage', 'Limit', 'Usage %'];
    const rows = Object.entries(usageMetrics.metrics).map(([key, value]) => {
      const percentage =
        value.limit > 0
          ? ((value.current / value.limit) * 100).toFixed(1)
          : '0';
      return [
        t(`metrics.${key}`),
        value.current.toString(),
        value.limit === -1 ? 'Unlimited' : value.limit.toString(),
        `${percentage}%`
      ];
    });

    // Add period information
    const periodStart = formatAppDate(
      usageMetrics.currentPeriod.start,
      intlLocale
    );
    const periodEnd = formatAppDate(usageMetrics.currentPeriod.end, intlLocale);

    const csvContent = [
      `Usage Report - ${periodStart} to ${periodEnd}`,
      '',
      headers.join(','),
      ...rows.map((row) => row.join(','))
    ].join('\n');

    // Add BOM for UTF-8 encoding (fixes encoding in Excel)
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `usage-report-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div>{tCommon('loading')}</div>;
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <Button
          variant='ghost'
          onClick={() => router.push('/settings/organization/billing')}
        >
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('backToBilling')}
        </Button>

        <Button variant='outline' onClick={handleExportUsage}>
          <Download className='mr-2 h-4 w-4' />
          {t('exportReport')}
        </Button>
      </div>

      {usageMetrics && (
        <>
          <UsageMetrics metrics={usageMetrics} />

          {/* Additional Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <TrendingUp className='h-5 w-5' />
                {t('recommendations')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-sm text-gray-600'>
                {t('recommendationsDesc')}
              </p>

              <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
                <p className='mb-2 font-medium text-blue-900'>💡 {t('tip')}</p>
                <p className='text-sm text-blue-800'>{t('tipDesc')}</p>
              </div>

              <Button
                onClick={() => router.push('/settings/organization/billing')}
                className='w-full'
              >
                {t('viewPlans')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
