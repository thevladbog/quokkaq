'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='bg-card/80 flex min-h-[5.5rem] flex-col justify-center rounded-lg border p-3 text-center shadow-sm'>
      <div className='text-muted-foreground text-xs uppercase'>{label}</div>
      <div className='text-3xl font-bold tabular-nums'>{children}</div>
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
        —
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
  servedToday
}: {
  queueLength?: number | null;
  activeCounters?: number | null;
  estimatedWaitMinutes?: number | null;
  servedToday?: number | null;
}) {
  const t = useTranslations('screen');
  return (
    <div
      className='grid grid-cols-2 gap-2 text-center'
      role='region'
      aria-label={t('stats.aria', { default: 'Queue summary' })}
    >
      <StatCell label={t('stats.inQueue', { default: 'In queue' })}>
        {fmt(t, queueLength)}
      </StatCell>
      <StatCell label={t('stats.openWindows', { default: 'Open windows' })}>
        {fmt(t, activeCounters)}
      </StatCell>
      <StatCell label={t('stats.estWait', { default: 'Est. wait' })}>
        {fmt(t, estimatedWaitMinutes, true)}
      </StatCell>
      <StatCell label={t('stats.servedToday', { default: 'Served today' })}>
        {fmt(t, servedToday)}
      </StatCell>
    </div>
  );
}
