'use client';

import { useId } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';

type Stats = {
  queueLength: number;
  averageWaitTimeMinutes: number;
};

export function SupervisorShiftSnapshot({
  stats,
  statsLoading
}: {
  stats: Stats | undefined;
  statsLoading: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const reportCtaId = useId();

  return (
    <Card className='bg-primary text-primary-foreground border-primary'>
      <CardHeader>
        <CardTitle className='text-primary-foreground'>
          {t('snapshotTitle')}
        </CardTitle>
        <CardDescription className='text-primary-foreground/80'>
          {t('snapshotDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <div className='border-primary-foreground/20 flex justify-between border-b py-2'>
          <span className='text-primary-foreground/90'>
            {t('kpiTotalWaiting')}
          </span>
          <span className='font-semibold tabular-nums'>
            {statsLoading ? '…' : (stats?.queueLength ?? 0)}
          </span>
        </div>
        <div className='border-primary-foreground/20 flex justify-between border-b py-2'>
          <span className='text-primary-foreground/90'>
            {t('snapshotPeakWait')}
          </span>
          <span className='font-semibold tabular-nums'>
            {statsLoading
              ? '…'
              : stats != null
                ? `${stats.averageWaitTimeMinutes} ${t('kpiMinSuffix')}`
                : '—'}
          </span>
        </div>
        <div className='flex justify-between py-2'>
          <span className='text-primary-foreground/90'>
            {t('snapshotFootfall')}
          </span>
          <span className='font-semibold tabular-nums'>
            {statsLoading ? '…' : '—'}
          </span>
        </div>
      </CardContent>
      <CardFooter>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-labelledby={reportCtaId}
                className='focus-visible:ring-ring/50 inline-flex w-full rounded-md outline-none focus-visible:ring-[3px]'
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                  }
                }}
              >
                <Button
                  id={reportCtaId}
                  variant='secondary'
                  type='button'
                  className='pointer-events-none w-full opacity-50'
                  aria-disabled
                  tabIndex={-1}
                  onClick={(e) => e.preventDefault()}
                >
                  {t('snapshotReportCta')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('snapshotReportTooltip')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}
