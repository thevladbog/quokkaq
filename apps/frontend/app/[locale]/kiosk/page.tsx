'use client';

import { useUnits } from '@/lib/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';
import { useRouter } from '@/src/i18n/navigation';
import KioskLanguageSwitcher from '@/components/KioskLanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import { KioskTopBar } from '@/components/kiosk/kiosk-top-bar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getUnitDisplayName } from '@/lib/unit-display';

const KIOSK_BODY = '#fef8f3';
const KIOSK_HEADER = '#fff9f4';

const unitTileClassName = cn(
  'border-kiosk-border/30 flex min-h-[5.5rem] w-full flex-col rounded-3xl border bg-card text-left shadow-[0_16px_24px_-8px_rgba(29,27,25,0.08)] transition-[transform,box-shadow]',
  'hover:shadow-[0_20px_28px_-10px_rgba(29,27,25,0.1)] focus-visible:ring-kiosk-ink/30 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
  'active:scale-[0.99] sm:h-32'
);

export default function KioskPage() {
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const {
    data: units = [],
    isLoading: unitsLoading,
    error: unitsError
  } = useUnits();
  const router = useRouter();
  const t = useTranslations('kiosk');

  useEffect(() => {
    const tick = () => setCurrentTime(new Date());
    const startId = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(id);
    };
  }, []);

  const topBarLeading = (
    <p className='text-kiosk-ink truncate text-lg font-bold tracking-tight sm:text-xl md:text-2xl'>
      {t('kioskTitle', { defaultValue: 'Kiosk' })}
    </p>
  );

  const topBarBeforeClock = (
    <div className='flex items-center gap-2 sm:gap-3'>
      <KioskLanguageSwitcher className='text-kiosk-ink h-11 min-w-[3.25rem] rounded-full border-0 bg-[#f2ede8] px-4 text-base font-semibold shadow-sm hover:bg-[#ebe4de] md:h-12 md:min-w-[3.5rem]' />
      <ThemeToggle />
    </div>
  );

  if (unitsLoading) {
    return (
      <div
        className='text-kiosk-ink flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4'
        style={{ backgroundColor: KIOSK_BODY }}
      >
        <KioskTopBar
          intlLocale={intlLocale}
          currentTime={currentTime}
          headerColor={KIOSK_HEADER}
          leading={topBarLeading}
          beforeClock={topBarBeforeClock}
        />
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='text-center'>
            <div className='border-kiosk-ink/30 mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-b-transparent'></div>
            <p className='text-kiosk-ink-muted'>{t('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (unitsError) {
    return (
      <div
        className='text-kiosk-ink flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4'
        style={{ backgroundColor: KIOSK_BODY }}
      >
        <KioskTopBar
          intlLocale={intlLocale}
          currentTime={currentTime}
          headerColor={KIOSK_HEADER}
          leading={topBarLeading}
          beforeClock={topBarBeforeClock}
        />
        <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
          <div className='max-w-md px-4 text-center'>
            <h2 className='mb-2 text-xl font-bold tracking-tight sm:text-2xl'>
              {t('errorLoadingUnits', { defaultValue: 'Error Loading Units' })}
            </h2>
            <p className='text-kiosk-ink-muted mb-6'>
              {(unitsError as Error).message}
            </p>
            <Button
              className='rounded-full px-8'
              onClick={() => router.refresh()}
            >
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleUnitSelect = (unitId: string) => {
    router.push(`/kiosk/${unitId}`);
  };

  return (
    <div
      className='text-kiosk-ink flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4'
      style={{ backgroundColor: KIOSK_BODY }}
    >
      <KioskTopBar
        intlLocale={intlLocale}
        currentTime={currentTime}
        headerColor={KIOSK_HEADER}
        leading={topBarLeading}
        beforeClock={topBarBeforeClock}
      />

      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <div className='mb-4 shrink-0 px-1 text-center sm:mb-5'>
          <h1 className='text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl'>
            {t('title', { defaultValue: 'Welcome' })}
          </h1>
          <p className='text-kiosk-ink-muted mt-2 text-base font-medium sm:text-lg'>
            {t('selectUnit', { defaultValue: 'Please select a unit' })}
          </p>
        </div>

        {units.length === 0 ? (
          <div className='flex min-h-0 flex-1 items-center justify-center overflow-hidden'>
            <div className='max-w-md px-4 text-center'>
              <h2 className='mb-2 text-xl font-bold'>
                {t('unit_selection_empty.title', {
                  defaultValue: 'No units available'
                })}
              </h2>
              <p className='text-kiosk-ink-muted'>
                {t('unit_selection_empty.body', {
                  defaultValue: 'There are no units available at this location.'
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className='mx-auto grid min-h-0 w-full max-w-7xl flex-1 auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6'>
            {units.map((unit) => (
              <button
                key={unit.id}
                type='button'
                className={unitTileClassName}
                onClick={() => handleUnitSelect(unit.id)}
                aria-label={t('select_unit_aria', {
                  unit: getUnitDisplayName(unit, locale)
                })}
              >
                <div className='flex flex-1 flex-col px-3 pt-4'>
                  <span className='text-kiosk-ink text-center text-lg font-bold sm:text-xl'>
                    {getUnitDisplayName(unit, locale)}
                  </span>
                </div>
                <div className='px-3 pb-4 text-center'>
                  <span className='border-kiosk-border/50 text-kiosk-ink inline-flex w-full items-center justify-center rounded-full border bg-transparent px-4 py-2 text-sm font-medium'>
                    {t('selectUnitButton', { defaultValue: 'Select Unit' })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
