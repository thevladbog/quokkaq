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
import { formatDistanceToNow } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import { getSupervisorActivityPresentation } from './supervisor-activity-presenter';

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
      ? `/supervisor/${dashboardUnitId}/journal?scopeUnitId=${encodeURIComponent(activityUnitId)}`
      : `/supervisor/${dashboardUnitId}/journal`;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shift-activity', activityUnitId, 'short'],
    queryFn: () => shiftApi.getActivity(activityUnitId!, { limit: 12 }),
    enabled: Boolean(activityUnitId && queryEnabled),
    refetchInterval: 10_000
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
          <ul className='space-y-3'>
            {items.map((item) => {
              const { icon: Icon, line } = getSupervisorActivityPresentation(
                item,
                t
              );
              const rel = formatDistanceToNow(new Date(item.createdAt), {
                addSuffix: true,
                locale: dateLocale
              });
              return (
                <li key={item.id} className='flex gap-3 text-sm'>
                  <Icon className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <p className='text-foreground'>{line}</p>
                    <p className='text-muted-foreground mt-0.5 text-xs'>
                      {rel}
                    </p>
                  </div>
                </li>
              );
            })}
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
