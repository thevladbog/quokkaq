'use client';

import { useEffect, useState } from 'react';
import { formatAppTime, intlLocaleFromAppLocale } from '@/lib/format-datetime';
export function ScreenClockWidget({ locale }: { locale: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const intl = intlLocaleFromAppLocale(locale);
  return (
    <div className='text-center'>
      <div className='font text-5xl font-bold tracking-tight tabular-nums'>
        {formatAppTime(now, intl)}
      </div>
    </div>
  );
}
