'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUnits } from '@/lib/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  formatAppDate,
  formatAppTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { useRouter } from '@/src/i18n/navigation';
import KioskLanguageSwitcher from '@/components/KioskLanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';

export default function KioskPage() {
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const {
    data: units = [],
    isLoading: unitsLoading,
    error: unitsError
  } = useUnits();
  const router = useRouter();
  const t = useTranslations('kiosk');

  if (unitsLoading) {
    return (
      <div className='bg-background flex min-h-screen flex-col p-4'>
        <div className='mb-4 flex items-center justify-between'>
          <div className='text-center'>
            <div className='text-3xl font-bold'>
              {formatAppTime(new Date(), intlLocale)}
            </div>
            <div className='mt-1 text-sm'>
              {formatAppDate(new Date(), intlLocale, 'full')}
            </div>
          </div>

          <div className='flex space-x-2'>
            <KioskLanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className='flex flex-1 items-center justify-center'>
          <div className='text-center'>
            <div className='border-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2'></div>
            <p className='text-muted-foreground'>{t('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (unitsError) {
    return (
      <div className='bg-background flex min-h-screen flex-col p-4'>
        <div className='mb-4 flex items-center justify-between'>
          <div className='text-center'>
            <div className='text-3xl font-bold'>
              {formatAppTime(new Date(), intlLocale)}
            </div>
            <div className='mt-1 text-sm'>
              {formatAppDate(new Date(), intlLocale, 'full')}
            </div>
          </div>

          <div className='flex space-x-2'>
            <KioskLanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div className='flex flex-1 items-center justify-center'>
          <div className='text-center'>
            <h2 className='mb-2 text-xl font-bold'>
              {t('errorLoadingUnits', { defaultValue: 'Error Loading Units' })}
            </h2>
            <p className='text-muted-foreground mb-4'>
              {(unitsError as Error).message}
            </p>
            <Button onClick={() => router.refresh()}>
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
    <div className='bg-background flex min-h-screen flex-col p-4'>
      <div className='mb-4 flex items-center justify-between'>
        <div className='text-center'>
          <div className='text-3xl font-bold'>
            {formatAppTime(new Date(), intlLocale)}
          </div>
          <div className='mt-1 text-sm'>
            {formatAppDate(new Date(), intlLocale, 'full')}
          </div>
        </div>

        <div className='flex space-x-2'>
          <KioskLanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>

      <div className='flex-1'>
        <div className='mb-8 text-center'>
          <h1 className='text-3xl font-bold'>
            {t('kioskTitle', { defaultValue: 'Kiosk' })}
          </h1>
          <p className='text-muted-foreground'>
            {t('selectUnit', { defaultValue: 'Please select a unit' })}
          </p>
        </div>

        {units.length === 0 ? (
          <div className='flex flex-1 items-center justify-center'>
            <div className='text-center'>
              <h2 className='mb-2 text-xl font-bold'>
                {t('noUnitsAvailable', { defaultValue: 'No Units Available' })}
              </h2>
              <p className='text-muted-foreground'>
                {t('noUnitsMessage', {
                  defaultValue: 'There are no units available at this location.'
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className='mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {units.map((unit) => (
              <Card
                key={unit.id}
                className='flex h-32 cursor-pointer flex-col transition-all hover:shadow-lg'
                onClick={() => handleUnitSelect(unit.id)}
              >
                <CardHeader className='flex flex-1 items-center justify-center'>
                  <CardTitle className='text-center text-xl'>
                    {unit.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className='pb-4 text-center'>
                  <Button variant='outline' className='w-full'>
                    {t('selectUnitButton', { defaultValue: 'Select Unit' })}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
