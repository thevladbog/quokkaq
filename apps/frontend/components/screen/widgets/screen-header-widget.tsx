'use client';

import type { Unit } from '@quokkaq/shared-types';
import {
  formatAppDate,
  formatAppTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { getUnitDisplayName } from '@/lib/unit-display';
import type { UnitConfig } from '@/lib/api';

type Props = {
  unit: Unit;
  locale: string;
  currentTime: Date;
  /** Widget config with optional title, showDate, showTime */
  config?: Record<string, unknown>;
  /** When true, skip large clock in header (e.g. template has clock widget). */
  hideClock?: boolean;
};

export function ScreenHeaderWidget({
  unit,
  locale,
  currentTime,
  config
}: Props) {
  const intlLocale = intlLocaleFromAppLocale(locale);
  const unitConfig = unit.config as UnitConfig | null | undefined;
  const logo = unitConfig?.adScreen?.logoUrl || unitConfig?.logoUrl;

  const customTitle = String(
    (config as { title?: string })?.title ?? ''
  ).trim();
  const showDate = (config as { showDate?: boolean })?.showDate !== false;
  const showTime = (config as { showTime?: boolean })?.showTime !== false;
  const displayTitle = customTitle || getUnitDisplayName(unit, locale);

  return (
    <div className='bg-card/95 flex h-full min-h-0 w-full flex-none items-center justify-between gap-3 border-b px-4 py-2 shadow-sm md:px-6'>
      <div className='flex min-w-0 items-center gap-3'>
        {logo ? (
          <div className='relative h-10 w-auto shrink-0 md:h-12'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt='' className='h-full w-auto object-contain' />
          </div>
        ) : null}
        <h1 className='text-primary truncate text-xl font-bold md:text-2xl'>
          {displayTitle}
        </h1>
      </div>
      {showTime || showDate ? (
        <div className='shrink-0 text-right'>
          {showTime && (
            <div className='font-mono text-xl font-bold md:text-2xl'>
              {formatAppTime(currentTime, intlLocale)}
            </div>
          )}
          {showDate && (
            <div className='text-muted-foreground text-xs md:text-sm'>
              {formatAppDate(currentTime, intlLocale, 'full')}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
