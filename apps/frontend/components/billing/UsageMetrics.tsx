'use client';

import { UsageMetrics as UsageMetricsType } from '@quokkaq/shared-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useTranslations } from 'next-intl';

interface UsageMetricsProps {
  metrics: UsageMetricsType;
}

export function UsageMetrics({ metrics }: UsageMetricsProps) {
  const t = useTranslations('organization.usage');
  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getMetricLabel = (key: string) => {
    return t(`metrics.${key}`);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd MMMM yyyy', { locale: ru });
  };

  const metricsArray = Object.entries(metrics.metrics).map(([key, value]) => ({
    key,
    label: getMetricLabel(key),
    current: value.current,
    limit: value.limit,
    percentage: value.limit === -1 ? 0 : (value.current / value.limit) * 100
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5' />
          {t('title')}
        </CardTitle>
        <CardDescription>
          {t('currentPeriod')}: {formatDate(metrics.currentPeriod.start)} -{' '}
          {formatDate(metrics.currentPeriod.end)}
        </CardDescription>
      </CardHeader>

      <CardContent className='space-y-6'>
        {metricsArray.map((metric) => (
          <div key={metric.key} className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>{metric.label}</span>
              <span className='text-sm text-gray-500'>
                {metric.current} / {metric.limit === -1 ? '∞' : metric.limit}
              </span>
            </div>

            {metric.limit === -1 ? (
              <div className='text-xs text-gray-500 italic'>
                {t('unlimited')}
              </div>
            ) : (
              <>
                <Progress
                  value={metric.percentage}
                  className='h-2'
                  indicatorClassName={getProgressColor(metric.percentage)}
                />
                <div className='flex items-center justify-between text-xs'>
                  <span
                    className={
                      metric.percentage >= 90 ? 'text-red-600' : 'text-gray-500'
                    }
                  >
                    {metric.percentage.toFixed(0)}% {t('used')}
                  </span>
                  {metric.percentage >= 90 && (
                    <span className='flex items-center gap-1 text-red-600'>
                      <AlertCircle className='h-3 w-3' />
                      {t('approaching')}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Warning if any metric is over 90% */}
        {metricsArray.some((m) => m.percentage >= 90) && (
          <div className='mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4'>
            <div className='flex items-start gap-3'>
              <AlertCircle className='mt-0.5 h-5 w-5 text-yellow-600' />
              <div>
                <p className='font-medium text-yellow-900'>
                  {t('approachingWarning')}
                </p>
                <p className='mt-1 text-sm text-yellow-700'>
                  {t('approachingDesc')}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
