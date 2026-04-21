'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import { useTranslations } from 'next-intl';
import type { ServicesStaffPerformanceResponse } from '@/lib/api/generated/statistics';

interface StaffRadarChartProps {
  data: ServicesStaffPerformanceResponse;
  className?: string;
}

export function StaffRadarChart({ data, className }: StaffRadarChartProps) {
  const t = useTranslations('statistics');

  const chartData = [
    {
      subject: t('radar_sla_wait'),
      value: data.slaWait ?? 100
    },
    {
      subject: t('radar_sla_service'),
      value: data.slaService ?? 100
    },
    {
      subject: t('radar_utilization'),
      value: data.utilizationPct ?? 0
    },
    {
      subject: t('radar_csat'),
      value: data.csatNorm ?? 0
    },
    {
      subject: t('radar_tph'),
      // Scale tickets/hour to 0-100: cap at 20 tph → 100%
      value: Math.min(100, ((data.ticketsPerHour ?? 0) / 20) * 100)
    }
  ];

  return (
    <div className={className}>
      <ResponsiveContainer width='100%' height={260}>
        <RadarChart cx='50%' cy='50%' outerRadius='75%' data={chartData}>
          <PolarGrid className='stroke-muted' />
          <PolarAngleAxis
            dataKey='subject'
            tick={{ fontSize: 12 }}
            className='text-muted-foreground fill-muted-foreground'
          />
          <Radar
            name={t('radar_series')}
            dataKey='value'
            stroke='var(--chart-1)'
            fill='var(--chart-1)'
            fillOpacity={0.35}
            strokeWidth={2}
          />
          <Tooltip
            formatter={(value) => [`${Number(value ?? 0).toFixed(1)}`, '']}
            contentStyle={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
              borderRadius: 6,
              fontSize: 12
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
