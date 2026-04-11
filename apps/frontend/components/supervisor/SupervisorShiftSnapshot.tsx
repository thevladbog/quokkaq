'use client';

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
            {t('snapshotCompletion')}
          </span>
          <span className='font-semibold tabular-nums'>
            {statsLoading ? '…' : '—'}
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
              <span className='w-full'>
                <Button
                  variant='secondary'
                  className='w-full'
                  disabled
                  type='button'
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
