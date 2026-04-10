'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { formatAppDate, formatAppTime } from '@/lib/format-datetime';

type KioskTopBarProps = {
  intlLocale: string;
  /** Null before client mount avoids SSR/CSR clock mismatch. */
  currentTime: Date | null;
  onClockClick?: () => void;
  headerColor: string;
  /** Left cluster: e.g. logo + optional unit title. */
  leading?: ReactNode;
  /** Right cluster before the clock: e.g. “I have a code”, language. Order: first item is leftmost of this group. */
  beforeClock?: ReactNode;
};

export function KioskTopBar({
  intlLocale,
  currentTime,
  onClockClick,
  headerColor,
  leading,
  beforeClock
}: KioskTopBarProps) {
  const onTimeKeyDown =
    onClockClick !== undefined
      ? (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClockClick();
          }
        }
      : undefined;

  const timeBlock = (
    <div
      className={
        onClockClick
          ? 'cursor-pointer text-right select-none'
          : 'text-right select-none'
      }
      onClick={onClockClick}
      onKeyDown={onTimeKeyDown}
      role={onClockClick ? 'button' : undefined}
      tabIndex={onClockClick ? 0 : undefined}
    >
      <div className='text-kiosk-ink text-xl font-bold tracking-tight sm:text-2xl md:text-3xl'>
        {formatAppTime(currentTime, intlLocale)}
      </div>
      <div className='text-kiosk-ink-muted mt-0.5 text-xs sm:text-sm'>
        {formatAppDate(currentTime, intlLocale, 'full', '')}
      </div>
    </div>
  );

  return (
    <header
      className='border-kiosk-border/40 mb-2 flex min-h-[4.5rem] shrink-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm sm:mb-3 sm:min-h-[5rem] sm:px-5 sm:py-4'
      style={{ backgroundColor: headerColor }}
    >
      <div className='flex min-w-0 flex-1 items-center gap-3'>{leading}</div>
      <div className='flex shrink-0 items-center gap-3 sm:gap-4 md:gap-6'>
        {beforeClock}
        {timeBlock}
      </div>
    </header>
  );
}
