'use client';

import { Clock, ListChecks, Monitor, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SupervisorKpiCard } from '@/components/supervisor/supervisor-kpi-card';

type Stats = {
  activeCountersCount: number;
  queueLength: number;
  averageWaitTimeMinutes: number;
};

export function SupervisorKpiRow({
  stats,
  statsLoading,
  totalCounters
}: {
  stats: Stats | undefined;
  statsLoading: boolean;
  totalCounters: number;
}) {
  const t = useTranslations('supervisor.dashboardUi');

  const occupied = stats?.activeCountersCount ?? 0;
  const utilizationPct =
    totalCounters > 0 ? Math.round((occupied / totalCounters) * 100) : null;

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <SupervisorKpiCard
        label={t('kpiTotalWaiting')}
        decorativeIcon={ListChecks}
        loading={statsLoading}
        footer={t('kpiLiveLabel')}
      >
        <div className='text-4xl font-bold tabular-nums'>
          {stats?.queueLength ?? 0}
        </div>
      </SupervisorKpiCard>

      <SupervisorKpiCard
        label={t('kpiAvgWait')}
        decorativeIcon={Clock}
        loading={statsLoading}
      >
        <div className='flex flex-wrap items-baseline gap-x-1.5 gap-y-0'>
          <span className='text-4xl font-bold tabular-nums'>
            {stats?.averageWaitTimeMinutes ?? 0}
          </span>
          <span className='text-muted-foreground text-lg font-medium tabular-nums'>
            {t('kpiMinSuffix')}
          </span>
        </div>
      </SupervisorKpiCard>

      <SupervisorKpiCard
        label={t('kpiActiveCounters')}
        decorativeIcon={Monitor}
        loading={statsLoading}
      >
        <div className='flex flex-wrap items-baseline gap-x-1.5'>
          <span className='text-4xl font-bold tabular-nums'>
            {String(occupied).padStart(2, '0')}
          </span>
          <span className='text-muted-foreground text-xl font-medium tabular-nums'>
            / {String(totalCounters).padStart(2, '0')}
          </span>
        </div>
      </SupervisorKpiCard>

      <SupervisorKpiCard
        label={t('kpiEfficiency')}
        decorativeIcon={Zap}
        variant='accent'
        loading={statsLoading}
        footer={t('kpiEfficiencyHint')}
      >
        <div className='text-4xl font-bold tabular-nums'>
          {utilizationPct != null ? `${utilizationPct}%` : '—'}
        </div>
      </SupervisorKpiCard>
    </div>
  );
}
