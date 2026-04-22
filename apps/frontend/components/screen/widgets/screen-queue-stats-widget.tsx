'use client';

import { useTranslations } from 'next-intl';

export function ScreenQueueStatsWidget({
  queueLength,
  activeCounters,
  estimatedWaitMinutes,
  servedToday
}: {
  queueLength: number;
  activeCounters: number;
  estimatedWaitMinutes?: number;
  servedToday?: number;
}) {
  const t = useTranslations('screen');
  return (
    <div className='grid grid-cols-2 gap-2 text-center'>
      <div className='bg-card/80 rounded-lg border p-3 shadow-sm'>
        <div className='text-muted-foreground text-xs uppercase'>
          {t('stats.inQueue', { default: 'In queue' })}
        </div>
        <div className='text-3xl font-bold tabular-nums'>{queueLength}</div>
      </div>
      <div className='bg-card/80 rounded-lg border p-3 shadow-sm'>
        <div className='text-muted-foreground text-xs uppercase'>
          {t('stats.openWindows', { default: 'Open windows' })}
        </div>
        <div className='text-3xl font-bold tabular-nums'>{activeCounters}</div>
      </div>
      {estimatedWaitMinutes != null && estimatedWaitMinutes > 0 ? (
        <div className='bg-card/80 rounded-lg border p-3 shadow-sm'>
          <div className='text-muted-foreground text-xs uppercase'>
            {t('stats.estWait', { default: 'Est. wait' })}
          </div>
          <div className='text-3xl font-bold tabular-nums'>
            ~{Math.round(estimatedWaitMinutes)} {t('minutes')}
          </div>
        </div>
      ) : null}
      {servedToday != null && servedToday > 0 ? (
        <div className='bg-card/80 rounded-lg border p-3 shadow-sm'>
          <div className='text-muted-foreground text-xs uppercase'>
            {t('stats.servedToday', { default: 'Served today' })}
          </div>
          <div className='text-3xl font-bold tabular-nums'>{servedToday}</div>
        </div>
      ) : null}
    </div>
  );
}
