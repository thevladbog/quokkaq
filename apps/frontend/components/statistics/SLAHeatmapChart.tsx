'use client';

import { useMemo } from 'react';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from '@/components/ui/tooltip';
import type { ServicesSLAHeatmapCell } from '@/lib/api/generated/statistics';

// ─── colour scale ─────────────────────────────────────────────────────────────

/**
 * Maps a compliance percentage [0–100] to a colour:
 *   0  → red (hsl ~0°)
 *   50 → yellow (hsl ~60°)
 *   100 → green (hsl ~120°)
 * Saturation and lightness are tuned to look good in both light and dark themes.
 */
function pctToColor(pct: number): string {
  const hue = Math.round((pct / 100) * 120);
  // dark mode: lighter colours; light mode: a bit deeper
  return `hsl(${hue}, 72%, 42%)`;
}

// ─── types ────────────────────────────────────────────────────────────────────

type CellKey = string; // "YYYY-MM-DD|H"

interface SLAHeatmapChartProps {
  cells: ServicesSLAHeatmapCell[];
  dateFrom: string; // "YYYY-MM-DD"
  dateTo: string;
}

// ─── component ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function SLAHeatmapChart({
  cells,
  dateFrom,
  dateTo
}: SLAHeatmapChartProps) {
  const appLocale = useLocale();
  const dateLocale = appLocale.toLowerCase().startsWith('ru') ? ru : enUS;
  const t = useTranslations('statistics');

  // Build lookup map  date|hour → cell
  const cellMap = useMemo(() => {
    const m = new Map<CellKey, ServicesSLAHeatmapCell>();
    for (const c of cells) {
      if (c.date != null && c.hour != null) {
        m.set(`${c.date}|${c.hour}`, c);
      }
    }
    return m;
  }, [cells]);

  // All calendar days in the range
  const days = useMemo(() => {
    try {
      const start = parseISO(dateFrom);
      const end = parseISO(dateTo);
      return eachDayOfInterval({ start, end });
    } catch {
      return [];
    }
  }, [dateFrom, dateTo]);

  if (days.length === 0) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <div className='w-full overflow-x-auto'>
        <div className='min-w-[640px]'>
          {/* Hour header row */}
          <div className='mb-1 flex'>
            {/* spacer for day label column */}
            <div className='w-20 shrink-0' />
            <div
              className='grid flex-1'
              style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}
            >
              {HOURS.map((h) => (
                <div
                  key={h}
                  className='text-muted-foreground text-center text-[10px] leading-none font-medium'
                >
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Day rows */}
          <div className='flex flex-col gap-0.5'>
            {days.map((day) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const dayLabel = format(day, 'EEE, d MMM', {
                locale: dateLocale
              });

              return (
                <div key={dayStr} className='flex items-center'>
                  {/* Day label */}
                  <div className='text-muted-foreground w-20 shrink-0 pr-2 text-right text-[11px] leading-none font-medium'>
                    {dayLabel}
                  </div>

                  {/* 24 hour cells */}
                  <div
                    className='grid flex-1 gap-0.5'
                    style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}
                  >
                    {HOURS.map((h) => {
                      const cell = cellMap.get(`${dayStr}|${h}`);
                      const hasData = cell != null && (cell.total ?? 0) > 0;
                      const pct = hasData ? (cell.pct ?? 0) : null;

                      return (
                        <Tooltip key={h}>
                          <TooltipTrigger asChild>
                            <div
                              className='aspect-square w-full rounded-[2px] transition-opacity hover:opacity-80'
                              style={{
                                backgroundColor: hasData
                                  ? pctToColor(pct!)
                                  : 'var(--color-muted, hsl(var(--muted)))',
                                opacity: hasData ? 1 : 0.35
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side='top' className='max-w-[200px]'>
                            <p className='font-semibold'>
                              {dayLabel} · {String(h).padStart(2, '0')}:00–
                              {String(h + 1).padStart(2, '0')}:00
                            </p>
                            {hasData ? (
                              <>
                                <p className='mt-0.5'>
                                  {t('sla_heatmap_tooltip_met', {
                                    met: cell!.met ?? 0,
                                    total: cell!.total ?? 0
                                  })}
                                </p>
                                <p className='text-foreground/70 mt-0.5 font-bold'>
                                  {pct!.toLocaleString(appLocale, {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1
                                  })}
                                  %
                                </p>
                              </>
                            ) : (
                              <p className='text-foreground/60 mt-0.5'>
                                {t('sla_heatmap_legend_no_data')}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className='mt-3 flex items-center gap-3'>
            <span className='text-muted-foreground text-[11px]'>
              {t('sla_heatmap_legend_breach')}
            </span>
            <div
              className='h-2.5 flex-1 rounded-full'
              style={{
                background:
                  'linear-gradient(to right, hsl(0,72%,42%), hsl(60,72%,42%), hsl(120,72%,42%))'
              }}
            />
            <span className='text-muted-foreground text-[11px]'>
              {t('sla_heatmap_legend_perfect')}
            </span>
            <span className='text-muted-foreground ml-2 inline-flex items-center gap-1.5 text-[11px]'>
              <span
                className='inline-block h-2.5 w-2.5 rounded-[2px]'
                style={{
                  backgroundColor: 'var(--color-muted, hsl(var(--muted)))',
                  opacity: 0.35
                }}
              />
              {t('sla_heatmap_legend_no_data')}
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
