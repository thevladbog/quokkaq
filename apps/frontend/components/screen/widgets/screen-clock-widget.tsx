'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatAppTime, intlLocaleFromAppLocale } from '@/lib/format-datetime';

export function ScreenClockWidget({
  locale,
  textAlign = 'center',
  size = 'default',
  use24Hour
}: {
  locale: string;
  textAlign?: 'left' | 'center';
  /** Smaller digits in bottom strip / portrait row. */
  size?: 'default' | 'compact';
  /** When set, forces 24h (overrides locale default for am/pm). */
  use24Hour?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setNow(new Date()));
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);
  if (now == null) {
    return <div className='min-w-0' aria-hidden />;
  }
  const intl = intlLocaleFromAppLocale(locale);
  return (
    <div
      className={cn(
        'min-w-0',
        textAlign === 'left' ? 'text-left' : 'text-center'
      )}
    >
      <div
        className={cn(
          'leading-none font-bold tracking-tight tabular-nums',
          size === 'compact' ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl'
        )}
      >
        {formatAppTime(
          now,
          intl,
          use24Hour === true
            ? { hour12: false }
            : use24Hour === false
              ? { hour12: true }
              : undefined
        )}
      </div>
    </div>
  );
}
