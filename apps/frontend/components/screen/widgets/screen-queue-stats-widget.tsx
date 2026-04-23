'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function StatCell({
  label,
  children,
  compact
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card/80 flex flex-col justify-center rounded-lg border text-center shadow-sm',
        compact ? 'min-h-[4.25rem] p-1.5' : 'min-h-[5.5rem] p-3'
      )}
    >
      <div
        className={cn(
          'text-muted-foreground uppercase',
          compact ? 'text-[8px] leading-tight font-medium' : 'text-xs'
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

function fmt(
  t: (key: string, values?: Record<string, string | number>) => string,
  value: number | null | undefined,
  isMinutes?: boolean
) {
  if (value == null) {
    return (
      <span className='text-muted-foreground text-2xl' aria-hidden>
        {t('stats.noData', { default: '—' })}
      </span>
    );
  }
  if (isMinutes) {
    return (
      <>
        ~{Math.round(value)} {t('minutes')}
      </>
    );
  }
  return <>{value}</>;
}

export function ScreenQueueStatsWidget({
  queueLength,
  activeCounters,
  estimatedWaitMinutes,
  servedToday,
  /** One horizontal row of four metrics (portrait bottom strip). */
  inlineRow = false
}: {
  queueLength?: number | null;
  activeCounters?: number | null;
  estimatedWaitMinutes?: number | null;
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
          ? 'grid auto-cols-[minmax(0,1fr)] grid-cols-4 gap-1'
          : 'grid grid-cols-2 gap-1.5 sm:gap-2'
      )}
      role='region'
      aria-label={t('stats.aria', { default: 'Queue summary' })}
    >
      <StatCell compact={c} label={t('stats.inQueue', { default: 'In queue' })}>
        {fmt(t, queueLength)}
      </StatCell>
      <StatCell
        compact={c}
        label={t('stats.openWindows', { default: 'Open windows' })}
      >
        {fmt(t, activeCounters)}
      </StatCell>
      <StatCell
        compact={c}
        label={t('stats.estWait', { default: 'Est. wait' })}
      >
        {fmt(t, estimatedWaitMinutes, true)}
      </StatCell>
      <StatCell
        compact={c}
        label={t('stats.servedToday', { default: 'Served today' })}
      >
        {fmt(t, servedToday)}
      </StatCell>
    </div>
  );
}
