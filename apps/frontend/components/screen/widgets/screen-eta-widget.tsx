'use client';

import { useTranslations } from 'next-intl';

export function ScreenEtaWidget({ minutes }: { minutes: number }) {
  const t = useTranslations('screen');
  const m = Math.max(0, Math.round(minutes));
  return (
    <div className='bg-card/80 rounded-xl border p-4 text-center shadow-sm'>
      <div className='text-muted-foreground text-sm font-medium tracking-wide uppercase'>
        {t('eta.estimate', { default: 'Est. wait' })}
      </div>
      <div className='text-primary text-5xl font-bold tabular-nums'>
        {m}
        <span className='text-2xl font-semibold opacity-80'>′</span>
      </div>
    </div>
  );
}
