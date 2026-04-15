'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useUnits } from '@/lib/hooks';
import {
  getGetUnitOperationsStatusQueryKey,
  useGetUnitOperationsStatus,
  usePostUnitOperationsClearStatisticsQuiet,
  usePostUnitOperationsEmergencyUnlock
} from '@/lib/api/generated/statistics';

export default function SettingsOperationsPage() {
  const t = useTranslations('operations');
  const { data: units = [], isLoading: unitsLoading } = useUnits();
  const queryClient = useQueryClient();

  const subdivisions = useMemo(
    () => units.filter((u) => u.kind === 'subdivision'),
    [units]
  );

  const [selectedUnitId, setSelectedUnitId] = useState('');
  const unitId = selectedUnitId || subdivisions[0]?.id || '';

  const statusQuery = useGetUnitOperationsStatus(unitId, {
    query: {
      enabled: Boolean(unitId),
      refetchInterval: 10_000
    }
  });

  const st = statusQuery.data?.data;

  const statusField = (
    resolve: (s: NonNullable<typeof st>) => React.ReactNode
  ) => {
    if (st == null) {
      return statusQuery.isLoading
        ? t('status_loading')
        : t('status_placeholder');
    }
    return resolve(st);
  };

  const unlockMutation = usePostUnitOperationsEmergencyUnlock({
    mutation: {
      onSuccess: async () => {
        toast.success(t('toast_unlock_ok'));
        await queryClient.invalidateQueries({
          queryKey: getGetUnitOperationsStatusQueryKey(unitId)
        });
      },
      onError: (e) => {
        const message = e instanceof Error ? e.message : String(e);
        toast.error(t('toast_error', { message }));
      }
    }
  });

  const clearQuietMutation = usePostUnitOperationsClearStatisticsQuiet({
    mutation: {
      onSuccess: async () => {
        toast.success(t('toast_clear_quiet_ok'));
        await queryClient.invalidateQueries({
          queryKey: getGetUnitOperationsStatusQueryKey(unitId)
        });
      },
      onError: (e) => {
        const message = e instanceof Error ? e.message : String(e);
        toast.error(t('toast_error', { message }));
      }
    }
  });

  const fmtTime = (iso?: string) => {
    if (!iso) return '—';
    try {
      return format(new Date(iso), 'yyyy-MM-dd HH:mm');
    } catch {
      return iso;
    }
  };

  return (
    <div className='container mx-auto flex-1 space-y-6 p-4'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>{t('title')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('unit_title')}</CardTitle>
          <CardDescription>{t('unit_hint')}</CardDescription>
        </CardHeader>
        <CardContent className='max-w-md space-y-2'>
          <Label htmlFor='subdivision'>{t('subdivision')}</Label>
          <Select
            value={unitId || undefined}
            onValueChange={setSelectedUnitId}
            disabled={unitsLoading || subdivisions.length === 0}
          >
            <SelectTrigger id='subdivision'>
              <SelectValue placeholder={t('subdivision_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {subdivisions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('status_title')}</CardTitle>
          {statusQuery.isFetching && (
            <CardDescription>{t('status_refreshing')}</CardDescription>
          )}
        </CardHeader>
        <CardContent className='grid gap-3 text-sm sm:grid-cols-2'>
          <div>
            <span className='text-muted-foreground'>{t('field_phase')}</span>{' '}
            <span className='font-medium'>{st?.phase ?? '—'}</span>
          </div>
          <div>
            <span className='text-muted-foreground'>{t('field_kiosk')}</span>{' '}
            <span className='font-medium'>
              {statusField((s) => (s.kioskFrozen ? t('yes') : t('no')))}
            </span>
          </div>
          <div>
            <span className='text-muted-foreground'>{t('field_counter')}</span>{' '}
            <span className='font-medium'>
              {statusField((s) =>
                s.counterLoginBlocked ? t('blocked') : t('allowed')
              )}
            </span>
          </div>
          <div>
            <span className='text-muted-foreground'>{t('field_quiet')}</span>{' '}
            <span className='font-medium'>
              {statusField((s) => (s.statisticsQuiet ? t('yes') : t('no')))}
            </span>
          </div>
          <div>
            <span className='text-muted-foreground'>
              {t('field_reconcile')}
            </span>{' '}
            <span className='font-medium'>
              {statusField((s) =>
                s.reconcileInProgress ? t('in_progress') : t('idle')
              )}
            </span>
          </div>
          <div className='sm:col-span-2'>
            <span className='text-muted-foreground'>
              {t('field_reconcile_note')}
            </span>{' '}
            <span className='font-medium'>
              {st?.reconcileProgressNote?.trim() || '—'}
            </span>
          </div>
          <div>
            <span className='text-muted-foreground'>{t('field_last_eod')}</span>{' '}
            <span className='font-medium'>{fmtTime(st?.lastEodAt)}</span>
          </div>
          <div>
            <span className='text-muted-foreground'>
              {t('field_last_reconcile')}
            </span>{' '}
            <span className='font-medium'>{fmtTime(st?.lastReconcileAt)}</span>
          </div>
          <div className='sm:col-span-2'>
            <span className='text-muted-foreground'>
              {t('field_stats_as_of')}
            </span>{' '}
            <span className='font-medium'>{fmtTime(st?.statisticsAsOf)}</span>
          </div>
          {st?.lastReconcileError ? (
            <div className='text-destructive sm:col-span-2'>
              <span className='font-medium'>{t('field_last_error')}</span>{' '}
              {st.lastReconcileError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('actions_title')}</CardTitle>
          <CardDescription>{t('actions_hint')}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-3'>
          <Button
            type='button'
            variant='destructive'
            disabled={!unitId || unlockMutation.isPending}
            onClick={() =>
              unlockMutation.mutate({
                unitId,
                data: { confirm: 'UNLOCK' }
              })
            }
          >
            {t('action_emergency_unlock')}
          </Button>
          <Button
            type='button'
            variant='secondary'
            disabled={!unitId || clearQuietMutation.isPending}
            onClick={() => clearQuietMutation.mutate({ unitId })}
          >
            {t('action_clear_quiet')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
