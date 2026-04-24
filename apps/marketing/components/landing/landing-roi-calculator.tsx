'use client';

import { useMemo, useState } from 'react';

import type { AppLocale, RoiMessages } from '@/src/messages';

const WORKDAYS = 22;
const STAFF_PROXY_RATIO = 0.06;

type Props = {
  locale: AppLocale;
  copy: RoiMessages;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function LandingRoiCalculator({ locale, copy }: Props) {
  const [visitors, setVisitors] = useState(180);
  const [waitMinutes, setWaitMinutes] = useState(12);
  const [locations, setLocations] = useState(3);
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';

  const { aggregateWaitHours, staffProxyHours } = useMemo(() => {
    const v = clamp(visitors, 1, 50_000);
    const w = clamp(waitMinutes, 1, 120);
    const l = clamp(locations, 1, 500);
    const hoursPerDay = v * (w / 60) * l;
    const aggregate = hoursPerDay * WORKDAYS;
    const staff = aggregate * STAFF_PROXY_RATIO;
    return {
      aggregateWaitHours: aggregate,
      staffProxyHours: staff
    };
  }, [visitors, waitMinutes, locations]);

  return (
    <div className='mx-auto max-w-3xl space-y-10'>
      <div className='rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm sm:p-8 dark:bg-[color:var(--color-surface-elevated)]'>
        <div className='space-y-8'>
          <label className='block'>
            <span className='mb-2 block text-sm font-semibold text-[color:var(--color-text)]'>
              {copy.visitorsPerDay}
            </span>
            <input
              type='range'
              min={10}
              max={5000}
              step={10}
              value={visitors}
              onChange={(e) => setVisitors(Number(e.target.value))}
              className='w-full accent-[color:var(--color-primary)]'
            />
            <span className='mt-1 block text-sm text-[color:var(--color-text-muted)] tabular-nums'>
              {visitors.toLocaleString(numberLocale)}
            </span>
          </label>
          <label className='block'>
            <span className='mb-2 block text-sm font-semibold text-[color:var(--color-text)]'>
              {copy.waitMinutes}
            </span>
            <input
              type='range'
              min={2}
              max={90}
              step={1}
              value={waitMinutes}
              onChange={(e) => setWaitMinutes(Number(e.target.value))}
              className='w-full accent-[color:var(--color-primary)]'
            />
            <span className='mt-1 block text-sm text-[color:var(--color-text-muted)] tabular-nums'>
              {waitMinutes}
              {'\u00a0'}
              {copy.minutesAbbrev}
            </span>
          </label>
          <label className='block'>
            <span className='mb-2 block text-sm font-semibold text-[color:var(--color-text)]'>
              {copy.locations}
            </span>
            <input
              type='range'
              min={1}
              max={200}
              step={1}
              value={locations}
              onChange={(e) => setLocations(Number(e.target.value))}
              className='w-full accent-[color:var(--color-primary)]'
            />
            <span className='mt-1 block text-sm text-[color:var(--color-text-muted)] tabular-nums'>
              {locations.toLocaleString(numberLocale)}
            </span>
          </label>
        </div>

        <dl className='mt-10 space-y-6 border-t border-[color:var(--color-border)] pt-8'>
          <div>
            <dt className='text-sm font-semibold text-[color:var(--color-text)]'>
              {copy.aggregateWaitLabel}
            </dt>
            <dd className='font-display mt-1 text-3xl font-bold text-[color:var(--color-primary)] tabular-nums'>
              {Math.round(aggregateWaitHours).toLocaleString(numberLocale)}
              {'\u00a0'}
              {copy.hoursAbbrev}
            </dd>
            <p className='mt-2 text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
              {copy.aggregateWaitHint}
            </p>
          </div>
          <div>
            <dt className='text-sm font-semibold text-[color:var(--color-text)]'>
              {copy.illustrativeStaffLabel}
            </dt>
            <dd className='font-display mt-1 text-3xl font-bold text-[color:var(--color-text)] tabular-nums'>
              {Math.round(staffProxyHours).toLocaleString(numberLocale)}
              {'\u00a0'}
              {copy.hoursAbbrev}
            </dd>
            <p className='mt-2 text-sm leading-relaxed text-[color:var(--color-text-muted)]'>
              {copy.illustrativeStaffHint}
            </p>
          </div>
        </dl>
      </div>

      <div className='rounded-2xl border border-amber-200/80 bg-amber-50/90 p-5 text-sm leading-relaxed text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/35 dark:text-amber-50'>
        <p className='font-semibold'>{copy.disclaimer}</p>
        <p className='mt-3 opacity-90'>{copy.methodology}</p>
      </div>
    </div>
  );
}
