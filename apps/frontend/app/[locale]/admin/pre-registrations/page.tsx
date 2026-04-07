'use client';

import { useEffect } from 'react';
import { useUnits } from '@/lib/hooks';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/src/i18n/navigation';
import { Loader2 } from 'lucide-react';

export default function PreRegistrationsIndexPage() {
  const { data: units = [], isLoading } = useUnits();
  const t = useTranslations('admin');
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && units.length === 1) {
      router.replace(`/admin/pre-registrations/${units[0].id}`);
    }
  }, [units, isLoading, router]);

  if (isLoading) {
    return (
      <div className='flex justify-center p-8'>
        <Loader2 className='animate-spin' />
      </div>
    );
  }

  if (units.length === 1) {
    return (
      <div className='flex justify-center p-8'>
        <Loader2 className='animate-spin' />
      </div>
    ); // Redirecting
  }

  return (
    <div className='container mx-auto p-4'>
      <h1 className='mb-6 text-3xl font-bold'>
        {t('navigation.pre_registrations', {
          defaultValue: 'Pre-registrations'
        })}
      </h1>
      <p className='text-muted-foreground mb-6'>
        {t('pre_registrations.select_unit', {
          defaultValue: 'Select a unit to manage pre-registrations.'
        })}
      </p>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {units.map((unit) => (
          <Card
            key={unit.id}
            className='hover:bg-accent cursor-pointer transition-colors'
            onClick={() => router.push(`/admin/pre-registrations/${unit.id}`)}
          >
            <CardHeader>
              <CardTitle>{unit.name}</CardTitle>
              <CardDescription>{unit.code}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant='outline' className='w-full'>
                {t('general.view', { defaultValue: 'Manage' })}
              </Button>
            </CardContent>
          </Card>
        ))}

        {units.length === 0 && (
          <div className='text-muted-foreground col-span-full py-8 text-center'>
            {t('units.no_units')}
          </div>
        )}
      </div>
    </div>
  );
}
