'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { enUS, ru } from 'date-fns/locale';
import {
  Bar,
  CartesianGrid,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import type { ServicesStaffPerformanceResponse } from '@/lib/api/generated/statistics';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import {
  formatStatisticsChartAxisLabel,
  formatStatisticsTooltipLabel
} from '@/lib/statistics-chart-dates';
import { StaffRadarChart } from './StaffRadarChart';
import { resolveCssColorToRgb } from '@/lib/resolve-css-color';

const trendChartConfig = {
  completed: {
    label: '',
    color: 'var(--chart-1)'
  },
  slaWait: {
    label: '',
    color: 'var(--chart-2)'
  }
} satisfies ChartConfig;

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
}
function KpiTile({ label, value, sub }: KpiTileProps) {
  return (
    <div className='bg-card flex flex-col gap-0.5 rounded-lg border px-4 py-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='text-xl font-semibold'>{value}</p>
      {sub && <p className='text-muted-foreground text-xs'>{sub}</p>}
    </div>
  );
}

function fmtDuration(ms?: number): string {
  if (!ms) return '—';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function fmtPct(v?: number): string {
  if (v === undefined || v === null) return '—';
  return `${v.toFixed(1)}%`;
}

interface StaffOperatorDetailCardProps {
  data: ServicesStaffPerformanceResponse;
}

export function StaffOperatorDetailCard({
  data
}: StaffOperatorDetailCardProps) {
  const t = useTranslations('statistics');
  const appLocale = useLocale();
  const dateLocale = appLocale.toLowerCase().startsWith('ru') ? ru : enUS;

  const containerRef = useRef<HTMLDivElement>(null);
  const [completedColor, setCompletedColor] = useState('rgb(218, 160, 42)');
  const [slaWaitColor, setSlaWaitColor] = useState('rgb(89, 89, 222)');
  useEffect(() => {
    if (!containerRef.current) return;
    const style = getComputedStyle(containerRef.current);
    const c1 = style.getPropertyValue('--chart-1').trim();
    const c2 = style.getPropertyValue('--chart-2').trim();
    if (c1) setCompletedColor(resolveCssColorToRgb(c1));
    if (c2) setSlaWaitColor(resolveCssColorToRgb(c2));
  }, []);

  const fmtDateTick = useMemo(
    () => (value: string | number) =>
      formatStatisticsChartAxisLabel(value, {
        hourly: false,
        locale: dateLocale
      }),
    [dateLocale]
  );

  const fmtTooltipLabel = useMemo(
    () => (label: string | number) =>
      formatStatisticsTooltipLabel(label, {
        hourly: false,
        locale: dateLocale
      }),
    [dateLocale]
  );

  const trendData = (data.dailyTrend ?? []).map((pt) => ({
    date: pt.date ?? '',
    completed: pt.ticketsCompleted ?? 0,
    slaWait: pt.slaWaitPct ?? 100
  }));

  return (
    <div ref={containerRef} className='space-y-6'>
      {/* KPI row */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4'>
        <KpiTile
          label={t('staff_detail_tickets_completed')}
          value={String(data.ticketsCompleted ?? 0)}
        />
        <KpiTile
          label={t('staff_detail_avg_wait')}
          value={fmtDuration(data.avgWaitMs)}
        />
        <KpiTile
          label={t('staff_detail_avg_service')}
          value={fmtDuration(data.avgServiceMs)}
        />
        <KpiTile
          label={t('staff_detail_sla_wait')}
          value={fmtPct(data.slaWait)}
          sub={
            data.slaWaitTotal
              ? `${data.slaWaitMet ?? 0} / ${data.slaWaitTotal}`
              : undefined
          }
        />
        <KpiTile
          label={t('staff_detail_sla_service')}
          value={fmtPct(data.slaService)}
          sub={
            data.slaServiceTotal
              ? `${data.slaServiceMet ?? 0} / ${data.slaServiceTotal}`
              : undefined
          }
        />
        <KpiTile
          label={t('staff_detail_utilization')}
          value={fmtPct(data.utilizationPct)}
        />
        <KpiTile
          label={t('staff_detail_break_time')}
          value={
            data.totalBreakMin !== undefined
              ? `${data.totalBreakMin.toFixed(0)} min`
              : '—'
          }
        />
        <KpiTile
          label={t('staff_detail_no_show')}
          value={String(data.noShowCount ?? 0)}
        />
      </div>

      {/* Radar + Trend */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              {t('staff_detail_profile')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StaffRadarChart data={data} />
          </CardContent>
        </Card>

        {trendData.length > 0 && (
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium'>
                {t('staff_detail_trend')}
              </CardTitle>
              <CardDescription className='text-xs'>
                {t('staff_detail_trend_hint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='h-[260px]'>
              <ChartContainer
                config={trendChartConfig}
                className='h-full w-full'
              >
                <ComposedChart data={trendData}>
                  <CartesianGrid
                    strokeDasharray='3 3'
                    className='stroke-muted'
                  />
                  <XAxis
                    dataKey='date'
                    tick={{ fontSize: 11 }}
                    className='text-muted-foreground'
                    tickFormatter={fmtDateTick}
                  />
                  <YAxis
                    yAxisId='left'
                    tick={{ fontSize: 11 }}
                    className='text-muted-foreground'
                  />
                  <YAxis
                    yAxisId='right'
                    orientation='right'
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    className='text-muted-foreground'
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent labelFormatter={fmtTooltipLabel} />
                    }
                  />
                  <Legend />
                  <Bar
                    yAxisId='left'
                    dataKey='completed'
                    name={t('legend_completed')}
                    fill={completedColor}
                    fillOpacity={0.8}
                  />
                  <Line
                    yAxisId='right'
                    type='monotone'
                    dataKey='slaWait'
                    name={t('radar_sla_wait')}
                    stroke={slaWaitColor}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
