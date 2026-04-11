'use client';

import { use, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { shiftApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { getSupervisorActivityPresentation } from '@/components/supervisor/supervisor-activity-presenter';
import { Link } from '@/src/i18n/navigation';

const PAGE_SIZE = 40;

export default function SupervisorJournalPage({
  params
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId: dashboardUnitId } = use(params);
  const searchParams = useSearchParams();
  const scopeUnitIdRaw = searchParams.get('scopeUnitId')?.trim() ?? '';
  const apiUnitId =
    scopeUnitIdRaw.length > 0 ? scopeUnitIdRaw : dashboardUnitId;

  const t = useTranslations('supervisor.dashboardUi');
  const locale = useLocale();
  const dateLocale = locale.startsWith('ru') ? ru : enUS;

  const dashboardHref = `/supervisor/${dashboardUnitId}`;

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['shift-activity', apiUnitId, 'journal'],
    queryFn: ({ pageParam }) =>
      shiftApi.getActivity(apiUnitId, {
        limit: PAGE_SIZE,
        cursor: pageParam
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor
  });

  const rows = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data?.pages]
  );

  return (
    <div className='container mx-auto max-w-3xl space-y-6 p-4'>
      <div>
        <Button variant='ghost' size='sm' className='mb-4 -ml-2' asChild>
          <Link href={dashboardHref}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            {t('journalBack')}
          </Link>
        </Button>
        <h1 className='text-2xl font-bold'>{t('journalTitle')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('journalDescription')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('activityTitle')}</CardTitle>
          <CardDescription>{t('journalCardDescription')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {isLoading ? (
            <div className='flex justify-center py-12'>
              <Loader2 className='text-muted-foreground h-10 w-10 animate-spin' />
            </div>
          ) : isError ? (
            <p className='text-destructive text-sm'>
              {t('activityError', { message: (error as Error)?.message ?? '' })}
            </p>
          ) : rows.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('activityEmpty')}
            </p>
          ) : (
            <>
              <ul className='divide-border divide-y rounded-lg border'>
                {rows.map((item) => {
                  const { icon: Icon, line } =
                    getSupervisorActivityPresentation(item, t);
                  const rel = formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                    locale: dateLocale
                  });
                  return (
                    <li key={item.id} className='flex gap-3 p-3 text-sm'>
                      <Icon className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                      <div className='min-w-0 flex-1'>
                        <p className='text-foreground'>{line}</p>
                        <p className='text-muted-foreground mt-1 text-xs'>
                          {rel}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hasNextPage ? (
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      {t('journalLoadingMore')}
                    </>
                  ) : (
                    t('journalLoadMore')
                  )}
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
