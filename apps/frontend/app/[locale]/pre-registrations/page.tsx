'use client';

import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
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
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { unitsApi } from '@/lib/api';

export default function PreRegistrationsIndexPage() {
  const { user, isLoading: authLoading } = useAuthContext();
  const { assignableUnitIds } = useActiveUnit();
  const t = useTranslations('admin');
  const router = useRouter();

  const queries = useQueries({
    queries: assignableUnitIds.map((id) => ({
      queryKey: ['unit', id] as const,
      queryFn: () => unitsApi.getById(id),
      enabled: assignableUnitIds.length > 0 && !authLoading
    }))
  });

  const units = useMemo(
    () =>
      queries
        .map((q, i) =>
          q.data ? { ...q.data, assignmentId: assignableUnitIds[i] } : null
        )
        .filter(Boolean) as Array<
        NonNullable<(typeof queries)[0]['data']> & { assignmentId: string }
      >,
    [queries, assignableUnitIds]
  );

  const unitsLoading =
    authLoading ||
    (assignableUnitIds.length > 0 && queries.some((q) => q.isLoading));

  useEffect(() => {
    if (unitsLoading) return;
    if (assignableUnitIds.length === 1) {
      router.replace(`/pre-registrations/${assignableUnitIds[0]}`);
    }
  }, [unitsLoading, assignableUnitIds, router]);

  if (unitsLoading || assignableUnitIds.length === 1) {
    return (
      <div className='flex justify-center p-8'>
        <Loader2 className='animate-spin' />
      </div>
    );
  }

  if (!user?.units?.length) {
    return (
      <div className='container mx-auto p-4'>
        <h1 className='mb-6 text-3xl font-bold'>
          {t('navigation.pre_registrations', {
            defaultValue: 'Pre-registrations'
          })}
        </h1>
        <p className='text-muted-foreground'>
          {t('units.no_units', { defaultValue: 'No units assigned.' })}
        </p>
      </div>
    );
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
            onClick={() => router.push(`/pre-registrations/${unit.id}`)}
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
