'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function ScreenEtaWidget({
  minutes,
  compact = false
}: {
  minutes: number;
  compact?: boolean;
}) {
  const t = useTranslations('screen');
  const m = Math.max(0, Math.round(minutes));
  return (
    <div
      className={cn(
        'bg-card/80 w-full rounded-xl border text-center shadow-sm',
        compact ? 'p-2' : 'p-4'
      )}
    >
      <div
        className={cn(
          'text-muted-foreground font-medium tracking-wide uppercase',
          compact ? 'text-[10px] leading-tight' : 'text-sm'
        )}
      >
        {t('eta.estimate', { default: 'Est. wait' })}
      </div>
      <div
        className={cn(
          'text-primary font-bold tabular-nums',
          compact ? 'text-2xl' : 'text-5xl'
        )}
      >
        ~{m}
        <span
          className={cn(
            'font-semibold opacity-80',
            compact ? 'text-sm' : 'text-2xl'
          )}
        >
          ′
        </span>
      </div>
    </div>
  );
}
