'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useUnits, useUnitServices } from '@/lib/hooks';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';

export default function AdminPage() {
  const {
    data: units = [],
    isLoading: unitsLoading,
    error: unitsError
  } = useUnits();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  useUnitServices(selectedUnitId || ''); // unitServices, servicesLoading, servicesError are unused
  const router = useRouter();

  const t = useTranslations('admin');

  if (unitsError) {
    return (
      <div className='container mx-auto p-4'>
        {t('error_loading_units', { error: (unitsError as Error).message })}
      </div>
    );
  }

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);

  return (
    <div className='container mx-auto flex-1 p-4'>
      <h1 className='mb-6 text-3xl font-bold'>{t('title')}</h1>

      <div className='mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('units.title')}</CardTitle>
            <CardDescription>{t('units.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table data-testid='e2e-admin-units-table'>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('units.code')}</TableHead>
                  <TableHead>{t('units.name')}</TableHead>
                  <TableHead>
                    {t('units.kind_column', { defaultValue: 'Type' })}
                  </TableHead>
                  <TableHead>{t('units.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((unit) => (
                  <TableRow
                    key={unit.id}
                    className={
                      selectedUnitId === unit.id
                        ? 'bg-accent'
                        : 'hover:bg-accent'
                    }
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <TableCell className='font-medium'>{unit.code}</TableCell>
                    <TableCell>{unit.name}</TableCell>
                    <TableCell>
                      {unit.kind === 'subdivision'
                        ? t('units.kind_subdivision')
                        : t('units.kind_service_zone')}
                    </TableCell>
                    <TableCell>
                      <Button variant='outline' size='sm'>
                        {t('units.edit')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button
              className='mt-4 w-full'
              disabled={unitsLoading || !selectedUnitId}
              onClick={() =>
                selectedUnitId &&
                router.push(`/settings/units/${selectedUnitId}`)
              }
            >
              {unitsLoading
                ? t('units.loading')
                : !selectedUnitId
                  ? t('select_unit_first')
                  : t('units.manage_services')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('services.title')}</CardTitle>
            <CardDescription>
              {t('services.description', {
                unit: selectedUnit?.name || t('selected_unit_fallback')
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground mb-4 text-center'>
              {t('services.manage_on_separate_page')}
            </p>
            <Button
              className='w-full'
              disabled={!selectedUnitId}
              onClick={() =>
                selectedUnitId &&
                router.push(`/settings/units/${selectedUnitId}`)
              }
            >
              {t('units.manage_services')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>{t('users.title')}</CardTitle>
            <CardDescription>{t('users.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className='w-full'>{t('users.manage')}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('reports.title')}</CardTitle>
            <CardDescription>{t('reports.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className='w-full'>{t('reports.view')}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.title')}</CardTitle>
            <CardDescription>{t('settings.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className='w-full'>{t('settings.manage')}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
