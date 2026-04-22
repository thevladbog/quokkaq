'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { shiftApi } from '@/lib/api';
import { Link } from '@/src/i18n/navigation';
import { Loader2 } from 'lucide-react';
import { enUS, ru } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { SupervisorActivityRow } from '@/components/supervisor/SupervisorActivityRow';

/** Max rows on the supervisor dashboard; full history is on the journal page. */
const DASHBOARD_ACTIVITY_LIMIT = 6;

export function SupervisorRecentActivity({
  dashboardUnitId,
  activityUnitId,
  queryEnabled
}: {
  dashboardUnitId: string;
  activityUnitId: string | null;
  queryEnabled: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const locale = useLocale();
  const dateLocale = locale.startsWith('ru') ? ru : enUS;

  const journalHref =
    activityUnitId && activityUnitId !== dashboardUnitId
      ? `/journal/${dashboardUnitId}?scopeUnitId=${encodeURIComponent(activityUnitId)}`
      : `/journal/${dashboardUnitId}`;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'shift-activity',
      activityUnitId,
      'short',
      DASHBOARD_ACTIVITY_LIMIT
    ],
    queryFn: () =>
      shiftApi.getActivity(activityUnitId!, {
        limit: DASHBOARD_ACTIVITY_LIMIT
      }),
    enabled: Boolean(activityUnitId && queryEnabled),
    refetchInterval: 10_000,
    refetchOnMount: 'always'
  });

  const items = data?.items ?? [];
  const showLive = Boolean(activityUnitId && queryEnabled);
  const showEmpty = showLive && !isLoading && !isError && items.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('activityTitle')}</CardTitle>
        <CardDescription>
          {showLive ? t('activityDescriptionLive') : t('activityDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {!showLive ? (
          <p className='text-muted-foreground text-sm'>
            {t('activityPendingScope')}
          </p>
        ) : isLoading ? (
          <div className='flex justify-center py-6'>
            <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
          </div>
        ) : isError ? (
          <p className='text-destructive text-sm'>
            {t('activityError', { message: (error as Error)?.message ?? '' })}
          </p>
        ) : showEmpty ? (
          <p className='text-muted-foreground text-sm'>{t('activityEmpty')}</p>
        ) : (
          <ul className='space-y-1 rounded-lg border'>
            {items.map((item) => (
              <SupervisorActivityRow
                key={item.id}
                item={item}
                t={t}
                dateLocale={dateLocale}
                timeFormat='PPp'
                className='border-border/60 border-b last:border-b-0'
              />
            ))}
          </ul>
        )}

        {showLive && !isError ? (
          <Button variant='link' className='h-auto px-0' asChild>
            <Link href={journalHref}>{t('activityFullLog')}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
