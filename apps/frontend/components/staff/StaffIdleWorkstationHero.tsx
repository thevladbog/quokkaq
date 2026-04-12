'use client';

import { VisitorPhotoFrame } from '@/components/staff/VisitorPhotoFrame';
import type { TFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface StaffIdleWorkstationHeroProps {
  waitingCount: number;
  t: TFn;
  className?: string;
}

/** Compact idle strip: portrait + status + queue count in one band (operator density). */
export function StaffIdleWorkstationHero({
  waitingCount,
  t,
  className
}: StaffIdleWorkstationHeroProps) {
  return (
    <div
      className={cn(
        'border-border/60 bg-muted/25 flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center sm:gap-3 sm:p-2.5',
        className
      )}
    >
      <VisitorPhotoFrame
        variant='idle'
        size='sm'
        firstName=''
        lastName=''
        ariaLabel={t('current.idle_portrait_aria')}
      />

      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-violet-900 uppercase dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200'>
            <span className='relative flex h-1.5 w-1.5' aria-hidden>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60' />
              <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-600 dark:bg-violet-400' />
            </span>
            {t('current.idle_badge')}
          </span>
          <h2 className='text-foreground text-sm leading-tight font-semibold sm:text-base'>
            {t('current.idle_title')}
          </h2>
        </div>
        <p className='text-muted-foreground mt-0.5 text-[11px] leading-snug sm:text-xs'>
          {t('current.idle_subtitle')}
        </p>
      </div>

      <div className='border-border/60 bg-background flex shrink-0 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 sm:flex-col sm:items-stretch sm:py-2'>
        <span className='text-muted-foreground text-[9px] font-medium tracking-wide uppercase'>
          {t('queue.title')}
        </span>
        <span className='text-foreground text-xl font-bold tabular-nums sm:text-right'>
          {waitingCount}
        </span>
      </div>
    </div>
  );
}
