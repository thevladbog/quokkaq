'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type KioskSessionIdleBarProps = {
  open: boolean;
  remainingSec: number;
  countdownSec: number;
  onContinue: () => void;
  highContrast?: boolean;
  /** Pixels from bottom to leave for another fixed strip (e.g. build status). */
  bottomOffset?: number;
};

/**
 * Non-blocking session idle warning: fixed bottom bar (replaces full-screen dialog).
 */
export function KioskSessionIdleBar({
  open,
  remainingSec,
  countdownSec,
  onContinue,
  highContrast,
  bottomOffset = 0
}: KioskSessionIdleBarProps) {
  const t = useTranslations('kiosk');

  if (!open) {
    return null;
  }

  const total = Math.max(1, countdownSec);
  const label = t('settings.session_idle_body_aria', {
    seconds: remainingSec
  });

  return (
    <div
      className={cn(
        'border-kiosk-border/50 fixed right-0 left-0 z-[40] border-t shadow-[0_-8px_32px_rgba(0,0,0,0.12)]',
        highContrast
          ? 'bg-zinc-900/98 text-white'
          : 'bg-background/98 text-foreground'
      )}
      style={{ bottom: bottomOffset }}
      role='status'
      aria-live='polite'
    >
      <div className='mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3 sm:px-5 sm:py-4 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
        <p
          className={cn(
            'text-sm font-medium sm:text-base',
            highContrast ? 'text-zinc-100' : 'text-foreground/90'
          )}
        >
          {t('settings.session_idle_title')}
        </p>
        <p
          className={cn(
            'text-sm leading-snug',
            highContrast ? 'text-zinc-300' : 'text-muted-foreground'
          )}
        >
          {t('settings.session_idle_body')}
        </p>
        <div className='flex flex-col items-center gap-1.5 sm:flex-row sm:items-end sm:gap-4'>
          <span
            className='text-foreground w-full min-w-0 text-center text-3xl font-bold tabular-nums sm:w-auto sm:text-4xl'
            aria-label={label}
          >
            {remainingSec}
          </span>
          <Progress
            className='h-2.5 w-full min-w-0 sm:h-3'
            value={(remainingSec / total) * 100}
            indicatorClassName={highContrast ? 'bg-amber-400' : 'bg-foreground'}
          />
          <Button
            type='button'
            className='kiosk-touch-min min-h-12 w-full shrink-0 text-base font-semibold sm:w-auto sm:min-w-40 sm:px-6'
            onClick={onContinue}
          >
            {t('settings.session_idle_continue')}
          </Button>
        </div>
      </div>
    </div>
  );
}
