'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { formatAppDate, formatAppTime } from '@/lib/format-datetime';
import { cn } from '@/lib/utils';

type KioskTopBarProps = {
  intlLocale: string;
  /** Null before client mount avoids SSR/CSR clock mismatch. */
  currentTime: Date | null;
  onClockClick?: () => void;
  headerColor: string;
  /** When true, clock and labels use light text (high-contrast dark header). */
  useLightHeaderText?: boolean;
  /** Left cluster: e.g. logo + optional unit title. */
  leading?: ReactNode;
  /** Right cluster before the clock: e.g. “I have a code”, language. Order: first item is leftmost of this group. */
  beforeClock?: ReactNode;
  /** e.g. accessibility control; rendered below the time+date, right-aligned. */
  underClock?: ReactNode;
};

export function KioskTopBar({
  intlLocale,
  currentTime,
  onClockClick,
  headerColor,
  useLightHeaderText = false,
  leading,
  beforeClock,
  underClock
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

  const tCls = useLightHeaderText ? 'text-white' : 'text-kiosk-ink';
  const mCls = useLightHeaderText ? 'text-white/80' : 'text-kiosk-ink-muted';

  const timeBlock = (
    <div
      className={cn(
        onClockClick
          ? 'kiosk-touch-min flex cursor-pointer flex-col items-end justify-end rounded-lg px-2 py-1 text-right select-none'
          : 'kiosk-touch-min text-right select-none',
        tCls
      )}
      onClick={onClockClick}
      onKeyDown={onTimeKeyDown}
      role={onClockClick ? 'button' : undefined}
      tabIndex={onClockClick ? 0 : undefined}
    >
      <div
        className={cn(
          'text-xl font-bold tracking-tight sm:text-2xl md:text-3xl',
          tCls
        )}
      >
        {formatAppTime(currentTime, intlLocale)}
      </div>
      <div className={cn('mt-0.5 text-xs sm:text-sm', mCls)}>
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
      <div className='flex max-w-full min-w-0 shrink-0 items-center justify-end gap-2 sm:gap-3 md:gap-4'>
        {beforeClock}
        <div className='flex min-w-0 flex-col items-end justify-center gap-1.5 sm:gap-2'>
          {timeBlock}
          {underClock}
        </div>
      </div>
    </header>
  );
}
