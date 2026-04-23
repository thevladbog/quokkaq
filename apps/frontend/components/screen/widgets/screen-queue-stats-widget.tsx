'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  displayEstimateToCallMinutes,
  displayMaxWaitInQueueMinutes
} from '@/lib/queue-eta-display';

function StatCell({
  label,
  children,
  compact,
  className
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-card/80 flex flex-col justify-center rounded-lg border text-center shadow-sm',
        compact ? 'min-h-[4.25rem] p-1.5' : 'min-h-[5.5rem] p-3',
        className
      )}
    >
      <div
        className={cn(
          'text-muted-foreground uppercase',
          compact ? 'text-[7px] leading-tight font-medium' : 'text-xs'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'leading-tight font-bold tabular-nums',
          compact ? 'text-sm' : 'text-3xl'
        )}
      >
        {children}
      </div>
    </div>
  );
}

function fmtCount(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  return <>{value}</>;
}

function fmtEstimateToCall(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  const m = displayEstimateToCallMinutes(value);
  if (m <= 0) {
    return <>~0 {t('minutes')}</>;
  }
  return (
    <>
      ~{m} {t('minutes')}
    </>
  );
}

function fmtMaxWaitInQueue(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  const m = displayMaxWaitInQueueMinutes(value);
  return (
    <>
      {m} {t('minutes')}
    </>
  );
}

export function ScreenQueueStatsWidget({
  queueLength,
  activeCounters,
  estimatedWaitMinutes,
  maxWaitingInQueueMinutes,
  servedToday,
  /** One horizontal row of five metrics (portrait bottom strip). */
  inlineRow = false
}: {
  queueLength?: number | null;
  activeCounters?: number | null;
  estimatedWaitMinutes?: number | null;
  maxWaitingInQueueMinutes?: number | null;
  servedToday?: number | null;
  inlineRow?: boolean;
}) {
  const t = useTranslations('screen');
  const c = inlineRow;
  return (
    <div
      className={cn(
        'min-w-0 text-center',
        inlineRow ? 'w-max shrink-0' : 'w-full',
        inlineRow
          ? 'grid auto-cols-[minmax(0,1fr)] grid-cols-5 gap-0.5 sm:gap-1'
          : 'grid grid-cols-2 gap-1.5 sm:gap-2'
      )}
      role='region'
      aria-label={t('stats.aria', { default: 'Queue summary' })}
    >
      <StatCell compact={c} label={t('stats.inQueue', { default: 'In queue' })}>
        {fmtCount(t, queueLength)}
      </StatCell>
      <StatCell
        compact={c}
        label={t('stats.openWindows', { default: 'Open windows' })}
      >
        {fmtCount(t, activeCounters)}
      </StatCell>
      <StatCell
        compact={c}
        label={t('stats.estimateToCall', { default: 'Est. time to call' })}
      >
        {fmtEstimateToCall(t, estimatedWaitMinutes)}
      </StatCell>
      <StatCell
        compact={c}
        label={t('stats.maxWaitInQueue', {
          default: 'Longest wait (now)'
        })}
      >
        {fmtMaxWaitInQueue(t, maxWaitingInQueueMinutes)}
      </StatCell>
      <StatCell
        compact={c}
        className={!inlineRow ? 'col-span-2' : undefined}
        label={t('stats.servedToday', { default: 'Served today' })}
      >
        {fmtCount(t, servedToday)}
      </StatCell>
    </div>
  );
}
