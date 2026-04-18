'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { unitsApi, Unit } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { getUnitDisplayName } from '@/lib/unit-display';

export default function ScreenPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const t = useTranslations('screen');
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const data = await unitsApi.getAll();
        setUnits(data);
      } catch (error) {
        console.error('Failed to fetch units:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUnits();
  }, []);

  if (isLoading) {
    return (
      <div className='bg-background flex min-h-screen items-center justify-center'>
        <Spinner className='h-8 w-8' />
      </div>
    );
  }

  return (
    <div className='bg-background min-h-screen p-8'>
      <div className='mx-auto max-w-4xl'>
        <h1 className='mb-8 text-center text-4xl font-bold'>
          {t('selectUnit')}
        </h1>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
          {units.map((unit) => (
            <Card
              key={unit.id}
              className='border-primary/20 hover:border-primary cursor-pointer transition-shadow hover:shadow-lg'
              onClick={() =>
                router.push(`/screen/${unit.id}` as `/screen/${string}`)
              }
            >
              <CardHeader>
                <CardTitle className='text-center text-xl'>
                  {getUnitDisplayName(unit, locale)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='text-muted-foreground text-center'>
                  {unit.code}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {units.length === 0 && (
          <div className='text-muted-foreground mt-12 text-center'>
            {t('noUnitsFound')}
          </div>
        )}
      </div>
    </div>
  );
}
