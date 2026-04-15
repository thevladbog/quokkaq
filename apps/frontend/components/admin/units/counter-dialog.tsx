'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { getGetUnitsUnitIdCountersQueryKey } from '@/lib/api/generated/tickets-counters';
import { normalizeChildUnitsQueryData } from '@/lib/child-units-query';
import { getGetUnitsUnitIdChildUnitsQueryKey } from '@/lib/api/generated/units';
import { countersApi, Counter, unitsApi } from '@/lib/api';
import type { CounterServiceZoneFilter } from '@/components/admin/units/counter-zone-filter';

interface CounterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Subdivision id for counters API and child-zone list. */
  countersUnitId: string;
  /** Where this dialog was opened from: drives default / fixed service zone for new counters. */
  serviceZoneFilter?: CounterServiceZoneFilter;
  counter?: Counter | null;
}

function filterKey(f: CounterServiceZoneFilter): string {
  if (f === undefined) return 'any';
  if (f === null) return 'none';
  return f;
}

export function CounterDialog({
  open,
  onOpenChange,
  countersUnitId,
  serviceZoneFilter,
  counter
}: CounterDialogProps) {
  const t = useTranslations('admin.counters');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{counter ? t('edit') : t('add')}</DialogTitle>
        </DialogHeader>
        {open && (
          <CounterForm
            key={`${counter?.id ?? 'new'}-${filterKey(serviceZoneFilter)}`}
            countersUnitId={countersUnitId}
            serviceZoneFilter={serviceZoneFilter}
            counter={counter}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CounterForm({
  countersUnitId,
  serviceZoneFilter,
  counter,
  onOpenChange
}: {
  countersUnitId: string;
  serviceZoneFilter?: CounterServiceZoneFilter;
  counter?: Counter | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('admin.counters');
  const tGeneral = useTranslations('general');
  const queryClient = useQueryClient();
  const isEditing = !!counter;
  const [name, setName] = useState(counter?.name || '');
  const [serviceZoneId, setServiceZoneId] = useState<string | null>(() => {
    if (counter) {
      return counter.serviceZoneId ?? null;
    }
    return serviceZoneFilter === null
      ? null
      : typeof serviceZoneFilter === 'string' && serviceZoneFilter
        ? serviceZoneFilter
        : null;
  });

  const lockZoneForNewCounter =
    !isEditing &&
    (serviceZoneFilter === null ||
      (typeof serviceZoneFilter === 'string' && Boolean(serviceZoneFilter)));

  const { data: childUnitsRaw } = useQuery({
    queryKey: getGetUnitsUnitIdChildUnitsQueryKey(countersUnitId),
    queryFn: () => unitsApi.getChildUnits(countersUnitId),
    enabled: !!countersUnitId
  });

  const serviceZones = useMemo(
    () =>
      normalizeChildUnitsQueryData(childUnitsRaw).filter(
        (u) => u.kind === 'service_zone'
      ),
    [childUnitsRaw]
  );

  const createMutation = useMutation({
    mutationFn: (data: { name: string; serviceZoneId?: string | null }) =>
      countersApi.create(countersUnitId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdCountersQueryKey(countersUnitId)
      });
      toast.success(t('created_success'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t('created_error', { error: error.message }));
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; serviceZoneId?: string | null }) =>
      countersApi.update(counter!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdCountersQueryKey(countersUnitId)
      });
      toast.success(t('updated_success'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t('updated_error', { error: error.message }));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('name_required'));
      return;
    }

    let zonePayload = serviceZoneId ?? null;
    if (!isEditing) {
      if (serviceZoneFilter === null) {
        zonePayload = null;
      } else if (
        typeof serviceZoneFilter === 'string' &&
        serviceZoneFilter.trim()
      ) {
        zonePayload = serviceZoneFilter.trim();
      }
    }

    if (isEditing) {
      updateMutation.mutate({ name, serviceZoneId: zonePayload });
    } else {
      createMutation.mutate({ name, serviceZoneId: zonePayload });
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='name'>{t('name')}</Label>
        <Input
          id='name'
          placeholder='e.g. Counter 1'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='counter-service-zone'>{t('service_zone')}</Label>
        {lockZoneForNewCounter ? (
          <p
            id='counter-service-zone'
            className='text-muted-foreground border-input bg-muted/30 rounded-md border px-3 py-2 text-sm'
          >
            {serviceZoneFilter === null
              ? t('service_zone_locked_none')
              : t('service_zone_locked_zone', {
                  name:
                    serviceZones.find((z) => z.id === serviceZoneFilter)
                      ?.name ?? ''
                })}
          </p>
        ) : (
          <Select
            value={serviceZoneId ?? '__none__'}
            onValueChange={(v) => setServiceZoneId(v === '__none__' ? null : v)}
          >
            <SelectTrigger id='counter-service-zone' className='w-full'>
              <SelectValue placeholder={t('service_zone_none')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='__none__'>{t('service_zone_none')}</SelectItem>
              {serviceZones
                .filter(
                  (zone): zone is typeof zone & { id: string } =>
                    typeof zone.id === 'string' && zone.id.trim().length > 0
                )
                .map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          onClick={() => onOpenChange(false)}
        >
          {tGeneral('cancel')}
        </Button>
        <Button
          type='submit'
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {isEditing ? t('save') : t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
