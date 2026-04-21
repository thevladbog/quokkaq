'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';
import type {
  ServicesStaffingForecastResponse,
  ServicesHourlyStaffingForecast
} from '@/lib/api/generated/statistics';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface StaffingForecastPanelProps {
  data: ServicesStaffingForecastResponse;
  onParamsChange?: (params: {
    targetDate?: string;
    targetSlaPct?: number;
    targetMaxWaitMin?: number;
  }) => void;
  targetSlaPct: number;
  targetMaxWaitMin: number;
  targetDate: string;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

interface TooltipPayloadItem {
  name: string;
  value: number | string;
  color: string;
  payload: ServicesHourlyStaffingForecast;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function ForecastTooltip({ active, payload }: CustomTooltipProps) {
  const t = useTranslations('statistics');
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className='bg-background min-w-[170px] space-y-1 rounded-lg border p-3 text-sm shadow-lg'>
      <p className='text-foreground font-semibold'>{fmtHour(row.hour ?? 0)}</p>
      <p className='text-muted-foreground'>
        {t('sf_expected_arrivals')}:{' '}
        <span className='text-foreground font-medium'>
          {(row.expectedArrivals ?? 0).toFixed(1)}
        </span>
      </p>
      <p className='text-muted-foreground'>
        {t('sf_avg_svc_min')}:{' '}
        <span className='text-foreground font-medium'>
          {(row.avgServiceTimeMin ?? 0).toFixed(1)} min
        </span>
      </p>
      <p className='text-muted-foreground'>
        {t('sf_recommended_staff')}:{' '}
        <span className='text-foreground text-primary font-bold'>
          {row.recommendedStaff ?? 0}
        </span>
      </p>
      <p className='text-muted-foreground'>
        {t('sf_expected_sla')}:{' '}
        <span className='text-foreground font-medium'>
          {(row.expectedSlaPct ?? 0).toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

export function StaffingForecastPanel({
  data,
  onParamsChange,
  targetSlaPct,
  targetMaxWaitMin,
  targetDate
}: StaffingForecastPanelProps) {
  const t = useTranslations('statistics');
  const [localDate, setLocalDate] = useState(targetDate);
  const [localSla, setLocalSla] = useState(String(targetSlaPct));
  const [localWait, setLocalWait] = useState(String(targetMaxWaitMin));

  const summary = data.dailySummary;
  const hourlyData = (data.hourlyForecasts ?? []).map((h) => ({
    ...h,
    label: fmtHour(h.hour ?? 0)
  }));

  function applyParams() {
    const pct = parseFloat(localSla);
    const wait = parseFloat(localWait);
    onParamsChange?.({
      targetDate: localDate || undefined,
      targetSlaPct: isNaN(pct) ? undefined : pct,
      targetMaxWaitMin: isNaN(wait) ? undefined : wait
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') applyParams();
  }

  const maxStaff = summary?.maxRecommendedStaff ?? 1;

  return (
    <div className='space-y-6'>
      {/* Controls */}
      <div className='flex flex-wrap items-end gap-4'>
        <div className='flex min-w-[140px] flex-col gap-1'>
          <Label htmlFor='sf-date' className='text-muted-foreground text-xs'>
            {t('sf_target_date')}
          </Label>
          <Input
            id='sf-date'
            type='date'
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
            onBlur={applyParams}
            onKeyDown={handleKeyDown}
            className='h-8 text-sm'
          />
        </div>
        <div className='flex w-28 flex-col gap-1'>
          <Label htmlFor='sf-sla' className='text-muted-foreground text-xs'>
            {t('sf_target_sla')} (%)
          </Label>
          <Input
            id='sf-sla'
            type='number'
            min={50}
            max={99}
            step={5}
            value={localSla}
            onChange={(e) => setLocalSla(e.target.value)}
            onBlur={applyParams}
            onKeyDown={handleKeyDown}
            className='h-8 text-sm'
          />
        </div>
        <div className='flex w-32 flex-col gap-1'>
          <Label htmlFor='sf-wait' className='text-muted-foreground text-xs'>
            {t('sf_max_wait')} (min)
          </Label>
          <Input
            id='sf-wait'
            type='number'
            min={1}
            max={60}
            step={1}
            value={localWait}
            onChange={(e) => setLocalWait(e.target.value)}
            onBlur={applyParams}
            onKeyDown={handleKeyDown}
            className='h-8 text-sm'
          />
        </div>

        {/* Summary callout */}
        {summary && (
          <div className='ml-auto flex flex-wrap items-center gap-3'>
            <Badge variant='outline' className='h-7 px-3 text-xs'>
              {t('sf_peak_hour')}: {fmtHour(summary.peakHour ?? 0)} (
              {(summary.peakArrivals ?? 0).toFixed(0)} {t('sf_tickets')})
            </Badge>
            <Badge variant='secondary' className='h-7 px-3 text-xs'>
              {t('sf_max_recommended')}: {summary.maxRecommendedStaff ?? 0}{' '}
              {t('sf_agents')}
            </Badge>
            <Badge variant='secondary' className='h-7 px-3 text-xs'>
              {t('sf_avg_recommended')}:{' '}
              {(summary.avgRecommendedStaff ?? 0).toFixed(1)} {t('sf_agents')}
            </Badge>
          </div>
        )}
      </div>

      {/* Chart */}
      {hourlyData.length > 0 ? (
        <div className='h-56'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart
              data={hourlyData}
              margin={{ top: 4, right: 8, bottom: 0, left: -10 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='label'
                tick={{ fontSize: 11 }}
                interval={1}
                angle={-30}
                textAnchor='end'
                height={36}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                domain={[0, Math.ceil(maxStaff * 1.25)]}
              />
              <Tooltip content={<ForecastTooltip />} />
              <ReferenceLine
                y={summary?.avgRecommendedStaff ?? 0}
                stroke='hsl(var(--muted-foreground))'
                strokeDasharray='4 3'
                strokeWidth={1.5}
              />
              <Bar
                dataKey='recommendedStaff'
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              >
                {hourlyData.map((entry) => {
                  const isPeak = entry.hour === (summary?.peakHour ?? -1);
                  return (
                    <Cell
                      key={`cell-${entry.hour}`}
                      fill={
                        isPeak
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--primary) / 0.45)'
                      }
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>{t('sf_no_data')}</p>
      )}

      <p className='text-muted-foreground text-xs'>
        {t('sf_erlang_hint', {
          dayOfWeek: data.dayOfWeek ?? '',
          sla: data.targetSlaPct ?? targetSlaPct,
          wait: data.targetMaxWaitMin ?? targetMaxWaitMin
        })}
      </p>
    </div>
  );
}
