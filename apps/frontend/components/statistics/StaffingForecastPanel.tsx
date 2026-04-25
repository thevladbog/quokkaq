'use client';

import { useId, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { format, parse, isValid } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import {
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ComposedChart,
  Line
} from 'recharts';
import type {
  ServicesStaffingForecastResponse,
  ServicesHourlyStaffingForecast
} from '@/lib/api/generated/statistics';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { russianWeekdayGenitive } from '@/lib/russian-weekday-genitive';

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

const SF_SLA_MIN = 50;
const SF_SLA_MAX = 99;
const SF_WAIT_MIN = 1;
const SF_WAIT_MAX = 60;
/** When |load trend| is below this (percent), badge stays non-alarming (avoids red for minor jitter). */
const SF_LOAD_TREND_BADGE_PCT = 5;

/** Arrivals band line/dot colors (distinct from each other; work on light and dark UIs). */
const SF_ARRIVALS_HIGH_STROKE = 'hsl(32 90% 46%)';
const SF_ARRIVALS_LOW_STROKE = 'hsl(217 85% 50%)';
/** Central series: on dark UI `hsl(var(--primary))` is often very dark; stroke stays visible. */
const SF_EXPECTED_ARRIVALS_STROKE = 'hsl(262 78% 62%)';

/** Parse and clamp numeric forecast params to match input min/max and backend defaults. */
function clampForecastParam(
  raw: string,
  min: number,
  max: number
): number | undefined {
  const v = parseFloat(raw);
  if (isNaN(v) || !isFinite(v) || v <= 0) return undefined;
  return Math.min(Math.max(v, min), max);
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

type HourlyArrivalsBandRow = ServicesHourlyStaffingForecast & {
  label: string;
  arrivalsHigh: number;
  arrivalsLow: number;
};

function ArrivalsBandTooltip({ active, payload }: CustomTooltipProps) {
  const t = useTranslations('statistics');
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as HourlyArrivalsBandRow;
  return (
    <div className='bg-background min-w-[200px] space-y-1.5 rounded-lg border p-3 text-sm shadow-lg'>
      <p className='text-foreground font-semibold'>{row.label}</p>
      <p className='text-muted-foreground flex items-center gap-2'>
        <span
          className='size-2.5 shrink-0 rounded-full'
          style={{ background: SF_ARRIVALS_HIGH_STROKE }}
        />
        <span>
          {t('sf_arrivals_high')}:{' '}
          <span className='text-foreground font-medium'>
            {row.arrivalsHigh.toFixed(1)}
          </span>
        </span>
      </p>
      <p className='text-muted-foreground flex items-center gap-2'>
        <span
          className='size-2.5 shrink-0 rounded-full'
          style={{ background: SF_ARRIVALS_LOW_STROKE }}
        />
        <span>
          {t('sf_arrivals_low')}:{' '}
          <span className='text-foreground font-medium'>
            {row.arrivalsLow.toFixed(1)}
          </span>
        </span>
      </p>
      <p className='text-muted-foreground flex items-center gap-2'>
        <span
          className='size-2.5 shrink-0 rounded-full ring-1'
          style={{
            background: SF_EXPECTED_ARRIVALS_STROKE,
            boxShadow: 'inset 0 0 0 1px hsl(0 0% 0% / 0.1)'
          }}
        />
        <span>
          {t('sf_expected_arrivals')}:{' '}
          <span className='text-foreground font-medium'>
            {(row.expectedArrivals ?? 0).toFixed(1)}
          </span>
        </span>
      </p>
    </div>
  );
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
  const appLocale = useLocale();
  const dateLocale = appLocale.toLowerCase().startsWith('ru') ? ru : enUS;
  const gId = useId().replace(/:/g, '');
  const gradHighToZeroId = `sfAHighDown-${gId}`;
  const gradLowToZeroId = `sfALowDown-${gId}`;
  const gradExpectedToZeroId = `sfAExpDown-${gId}`;

  const [localDate, setLocalDate] = useState(targetDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [localSla, setLocalSla] = useState(String(targetSlaPct));
  const [localWait, setLocalWait] = useState(String(targetMaxWaitMin));

  /** Parse the stored `YYYY-MM-DD` string to a Date for the Calendar. */
  const selectedDate = (() => {
    if (!localDate) return undefined;
    const d = parse(localDate, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  })();

  /** Display label: localized short date, e.g. "22 апр. 2026" / "Apr 22, 2026". */
  const displayDate = selectedDate
    ? format(selectedDate, 'PP', { locale: dateLocale })
    : t('sf_pick_date');

  /** Localized weekday for the hint line: Russian needs genitive after «для» (не «среда», а «среды»). */
  const localizedDayOfWeek = selectedDate
    ? appLocale.toLowerCase().startsWith('ru')
      ? russianWeekdayGenitive(selectedDate)
      : format(selectedDate, 'EEEE', { locale: dateLocale })
    : (data.dayOfWeek ?? '');

  const summary = data.dailySummary;
  const uncFrac = Math.max(0, (data.arrivalUncertaintyPct ?? 0) / 100);
  const hourlyData = (data.hourlyForecasts ?? []).map((h) => {
    const exp = h.expectedArrivals ?? 0;
    const high = exp * (1 + uncFrac);
    const low = Math.max(0, exp * (1 - uncFrac));
    return {
      ...h,
      label: fmtHour(h.hour ?? 0),
      arrivalsHigh: high,
      arrivalsLow: low
    };
  });

  const lineDot = (fill: string) => ({
    r: 3.5,
    fill,
    stroke: fill,
    strokeWidth: 1.5
  });

  function applyParams() {
    onParamsChange?.({
      targetDate: localDate || undefined,
      targetSlaPct: clampForecastParam(localSla, SF_SLA_MIN, SF_SLA_MAX),
      targetMaxWaitMin: clampForecastParam(localWait, SF_WAIT_MIN, SF_WAIT_MAX)
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
        <div className='flex min-w-[160px] flex-col gap-1'>
          <Label className='text-muted-foreground text-xs'>
            {t('sf_target_date')}
          </Label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                className={cn(
                  'h-8 justify-start gap-2 px-3 text-sm font-normal',
                  !selectedDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className='size-3.5 shrink-0' />
                {displayDate}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0' align='start'>
              <Calendar
                mode='single'
                selected={selectedDate}
                onSelect={(date) => {
                  const iso = date ? format(date, 'yyyy-MM-dd') : '';
                  setLocalDate(iso);
                  setCalendarOpen(false);
                  onParamsChange?.({
                    targetDate: iso || undefined,
                    targetSlaPct: clampForecastParam(
                      localSla,
                      SF_SLA_MIN,
                      SF_SLA_MAX
                    ),
                    targetMaxWaitMin: clampForecastParam(
                      localWait,
                      SF_WAIT_MIN,
                      SF_WAIT_MAX
                    )
                  });
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
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
            {(data.arrivalUncertaintyPct ?? 0) > 0 && (
              <Badge variant='outline' className='h-7 px-3 text-xs'>
                {t('sf_arrival_uncertainty')}:{' '}
                {(data.arrivalUncertaintyPct ?? 0).toFixed(1)}%
              </Badge>
            )}
            {(data.loadTrendPct ?? 0) !== 0 && (
              <Badge
                variant={
                  Math.abs(data.loadTrendPct ?? 0) >= SF_LOAD_TREND_BADGE_PCT
                    ? 'destructive'
                    : 'outline'
                }
                className='h-7 px-3 text-xs'
              >
                {t('sf_load_trend')}: {(data.loadTrendPct ?? 0) > 0 ? '+' : ''}
                {(data.loadTrendPct ?? 0).toFixed(1)}%
              </Badge>
            )}
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

      {/* Expected arrivals with uncertainty band (coefficient-of-variation proxy) */}
      {hourlyData.length > 0 && (data.arrivalUncertaintyPct ?? 0) > 0 && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs font-medium'>
            {t('sf_arrivals_band_title')}
          </p>
          <div className='h-36'>
            <ResponsiveContainer width='100%' height='100%'>
              <ComposedChart
                data={hourlyData}
                margin={{ top: 4, right: 8, bottom: 0, left: -10 }}
              >
                <defs>
                  {/* Downward fills: under each line to y=0; draw order: high (back) → low → expected (front). */}
                  <linearGradient
                    id={gradHighToZeroId}
                    x1='0'
                    y1='0'
                    x2='0'
                    y2='1'
                  >
                    <stop
                      offset='0%'
                      stopColor={SF_ARRIVALS_HIGH_STROKE}
                      stopOpacity={0.32}
                    />
                    <stop
                      offset='100%'
                      stopColor={SF_ARRIVALS_HIGH_STROKE}
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id={gradLowToZeroId}
                    x1='0'
                    y1='0'
                    x2='0'
                    y2='1'
                  >
                    <stop
                      offset='0%'
                      stopColor={SF_ARRIVALS_LOW_STROKE}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset='100%'
                      stopColor={SF_ARRIVALS_LOW_STROKE}
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id={gradExpectedToZeroId}
                    x1='0'
                    y1='0'
                    x2='0'
                    y2='1'
                  >
                    <stop
                      offset='0%'
                      stopColor={SF_EXPECTED_ARRIVALS_STROKE}
                      stopOpacity={0.5}
                    />
                    <stop
                      offset='100%'
                      stopColor={SF_EXPECTED_ARRIVALS_STROKE}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis
                  dataKey='label'
                  tick={{ fontSize: 10 }}
                  interval={1}
                  angle={-30}
                  textAnchor='end'
                  height={32}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals />
                <Tooltip content={<ArrivalsBandTooltip />} />
                <Area
                  type='monotone'
                  dataKey='arrivalsHigh'
                  name='_areaHigh'
                  baseValue={0}
                  stroke='none'
                  fill={`url(#${gradHighToZeroId})`}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Area
                  type='monotone'
                  dataKey='arrivalsLow'
                  name='_areaLow'
                  baseValue={0}
                  stroke='none'
                  fill={`url(#${gradLowToZeroId})`}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Area
                  type='monotone'
                  dataKey='expectedArrivals'
                  name='_areaExpected'
                  baseValue={0}
                  stroke='none'
                  fill={`url(#${gradExpectedToZeroId})`}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Line
                  type='monotone'
                  dataKey='arrivalsHigh'
                  name='arrivalsHigh'
                  stroke={SF_ARRIVALS_HIGH_STROKE}
                  strokeWidth={2}
                  dot={lineDot(SF_ARRIVALS_HIGH_STROKE)}
                  isAnimationActive={false}
                />
                <Line
                  type='monotone'
                  dataKey='arrivalsLow'
                  name='arrivalsLow'
                  stroke={SF_ARRIVALS_LOW_STROKE}
                  strokeWidth={2}
                  dot={lineDot(SF_ARRIVALS_LOW_STROKE)}
                  isAnimationActive={false}
                />
                <Line
                  type='monotone'
                  dataKey='expectedArrivals'
                  name='expectedArrivals'
                  stroke={SF_EXPECTED_ARRIVALS_STROKE}
                  strokeWidth={2.5}
                  dot={lineDot(SF_EXPECTED_ARRIVALS_STROKE)}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {summary != null &&
        hourlyData.length > 0 &&
        (summary.peakArrivals ?? 0) > 0 && (
          <div className='space-y-2 rounded-lg border border-dashed p-3'>
            <p className='text-foreground text-sm font-medium'>
              {t('sf_ai_recommendations_title')}
            </p>
            <ul className='text-muted-foreground list-inside list-disc space-y-1 text-xs'>
              <li>
                {t('sf_ai_peak_line', {
                  hour: fmtHour(summary.peakHour ?? 0),
                  n: (summary.peakArrivals ?? 0).toFixed(0)
                })}
              </li>
              {(data.loadTrendPct ?? 0) !== 0 ? (
                <li>
                  {(data.loadTrendPct ?? 0) > 0
                    ? t('sf_ai_trend_up_line', {
                        pct: Math.abs(data.loadTrendPct ?? 0).toFixed(1)
                      })
                    : t('sf_ai_trend_down_line', {
                        pct: Math.abs(data.loadTrendPct ?? 0).toFixed(1)
                      })}
                </li>
              ) : null}
              {(data.arrivalUncertaintyPct ?? 0) > 12 ? (
                <li>
                  {t('sf_ai_volatile_line', {
                    pct: (data.arrivalUncertaintyPct ?? 0).toFixed(1)
                  })}
                </li>
              ) : null}
            </ul>
          </div>
        )}

      <p className='text-muted-foreground text-xs'>
        {t('sf_erlang_hint', {
          dayOfWeek: localizedDayOfWeek,
          sla: data.targetSlaPct ?? targetSlaPct,
          wait: data.targetMaxWaitMin ?? targetMaxWaitMin
        })}
      </p>
      <p className='text-muted-foreground text-xs'>{t('sf_ai_hint')}</p>
    </div>
  );
}
