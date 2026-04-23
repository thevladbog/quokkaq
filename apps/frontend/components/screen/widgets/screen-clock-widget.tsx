'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatAppTime, intlLocaleFromAppLocale } from '@/lib/format-datetime';

export function ScreenClockWidget({
  locale,
  textAlign = 'center',
  size = 'default'
}: {
  locale: string;
  textAlign?: 'left' | 'center';
  /** Smaller digits in bottom strip / portrait row. */
  size?: 'default' | 'compact';
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
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
        {formatAppTime(now, intl)}
      </div>
    </div>
  );
}
