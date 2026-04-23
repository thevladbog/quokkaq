'use client';

import { useEffect, useState } from 'react';
import { unitsApi } from '@/lib/api';
import { logger } from '@/lib/logger';
import { resolveOpenMeteoSnapshot } from '@/lib/open-meteo-display';
import { cn } from '@/lib/utils';
import { WmoWeatherIcon } from '@/components/screen/widgets/weather-wmo-icon';

export type ScreenWeatherLayout = 'row' | 'stacked' | 'column';

type Snapshot = { temperatureC: number | null; weatherCode: number | null };

/**
 * Renders Open-Meteo data with WMO-based icon; {@link ScreenWeatherLayout} `row` pairs with clock in one line.
 */
export function ScreenWeatherWidget({
  unitId,
  feedId,
  layout = 'stacked'
}: {
  unitId: string;
  feedId: string;
  layout?: ScreenWeatherLayout;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const isRow = layout === 'row';
  const isColumn = layout === 'column';

  useEffect(() => {
    if (!feedId) return;
    let active = true;
    const load = async () => {
      try {
        const raw = (await unitsApi.getPublicFeedData(
          unitId,
          feedId
        )) as unknown as Record<string, unknown> | null;
        if (!raw || !active) return;
        setData(resolveOpenMeteoSnapshot(raw));
      } catch (e) {
        logger.error('weather widget', e);
      }
    };
    void load();
    const iv = setInterval(load, 300_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [unitId, feedId]);

  if (!data || data.temperatureC == null) {
    return (
      <div
        className={cn(
          'text-muted-foreground',
          isRow && 'text-right',
          isRow ? 'text-2xl' : isColumn ? 'text-lg' : 'text-4xl'
        )}
        aria-hidden
      >
        —
      </div>
    );
  }

  const deg = Math.round(data.temperatureC);
  const iconSize = isRow
    ? 'h-12 w-12 sm:h-14 sm:w-14'
    : isColumn
      ? 'h-7 w-7 sm:h-8 sm:w-8'
      : 'h-16 w-16 sm:h-20 sm:w-20';
  const tempClass = isRow
    ? 'text-2xl sm:text-3xl font-bold tabular-nums leading-none'
    : isColumn
      ? 'text-lg sm:text-xl font-bold tabular-nums leading-none'
      : 'text-4xl font-bold tabular-nums leading-tight sm:text-5xl';

  if (isColumn) {
    return (
      <div className='flex min-w-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-sky-500/20 bg-gradient-to-b from-sky-500/15 to-amber-400/5 px-2 py-1 shadow-sm sm:min-w-[4rem]'>
        <WmoWeatherIcon
          code={data.weatherCode}
          className={cn(iconSize, 'shrink-0 drop-shadow-sm')}
        />
        <div className='text-foreground tabular-nums'>
          <span className={tempClass}>{deg}</span>
          <span className='text-muted-foreground ml-0.5 text-xs font-bold'>
            °C
          </span>
        </div>
      </div>
    );
  }

  const body = (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2.5 sm:gap-3',
        isRow ? 'w-full justify-end' : 'justify-center',
        'rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/15 via-amber-400/10 to-sky-400/10 px-3 py-2 shadow-sm',
        isRow && 'pr-2.5 pl-2 sm:pr-3.5',
        !isRow && 'mx-auto w-full max-w-sm px-4 py-3 sm:px-5'
      )}
    >
      <WmoWeatherIcon
        code={data.weatherCode}
        className={cn(iconSize, 'drop-shadow-sm')}
      />
      <div
        className={cn(
          'text-foreground min-w-0',
          isRow ? 'text-left' : 'text-center'
        )}
      >
        <div
          className={cn(
            tempClass,
            'inline-flex items-baseline gap-0.5 tabular-nums select-none'
          )}
        >
          <span>{deg}</span>
          <span
            className={cn(
              'text-muted-foreground font-bold tracking-tight',
              isRow && 'text-lg sm:text-xl',
              !isRow && 'text-2xl sm:text-3xl'
            )}
          >
            °C
          </span>
        </div>
      </div>
    </div>
  );

  if (isRow) {
    return (
      <div className='flex w-full min-w-0 flex-col items-end justify-end gap-0.5 text-right'>
        {body}
      </div>
    );
  }
  return body;
}
