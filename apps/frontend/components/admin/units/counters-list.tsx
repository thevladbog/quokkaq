'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { countersApi, Counter } from '@/lib/api';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';
import { CounterDialog } from './counter-dialog';
import { cn } from '@/lib/utils';
import type { CounterServiceZoneFilter } from '@/components/admin/units/counter-zone-filter';

export type { CounterServiceZoneFilter } from '@/components/admin/units/counter-zone-filter';

export type UnitCountersSectionProps = {
  /** Subdivision id for GET/POST `/units/{id}/counters` and query invalidation. */
  countersUnitId: string;
  variant?: 'card' | 'embedded';
  /** Embedded: section title (ignored if hideEmbeddedHeading) */
  embeddedHeading?: string;
  embeddedDescription?: string;
  /** Embedded: only “Add” + table — for blocks that already have a parent title (e.g. zone folder) */
  hideEmbeddedHeading?: boolean;
  className?: string;
  /** See `CounterServiceZoneFilter`. */
  serviceZoneFilter?: CounterServiceZoneFilter;
};

function counterMatchesFilter(
  counter: Counter,
  filter: CounterServiceZoneFilter | undefined
): boolean {
  if (filter === undefined) return true;
  const z = counter.serviceZoneId?.trim() || null;
  if (filter === null) return z === null;
  return z === filter;
}

export function UnitCountersSection({
  countersUnitId,
  variant = 'card',
  embeddedHeading,
  embeddedDescription,
  hideEmbeddedHeading = false,
  className,
  serviceZoneFilter
}: UnitCountersSectionProps) {
  const t = useTranslations('admin.counters');
  const tCommon = useTranslations('common');
  const tGeneral = useTranslations('general');
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null);
  const [deletingCounter, setDeletingCounter] = useState<Counter | null>(null);

  const {
    data: countersRaw,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['counters', countersUnitId],
    queryFn: () => countersApi.getByUnitId(countersUnitId)
  });

  const counters = useMemo(() => {
    const list = countersRaw ?? [];
    return list.filter((c) => counterMatchesFilter(c, serviceZoneFilter));
  }, [countersRaw, serviceZoneFilter]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => countersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters', countersUnitId] });
      toast.success(t('deleted_success'));
      setDeletingCounter(null);
    },
    onError: (error) => {
      toast.error(t('deleted_error', { error: error.message }));
    }
  });

  const handleAdd = () => {
    setEditingCounter(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (counter: Counter) => {
    setEditingCounter(counter);
    setIsDialogOpen(true);
  };

  const handleDelete = (counter: Counter) => {
    setDeletingCounter(counter);
  };

  const confirmDelete = () => {
    if (deletingCounter) {
      deleteMutation.mutate(deletingCounter.id);
    }
  };

  const addButton = (
    <Button onClick={handleAdd} size='sm' className='shrink-0'>
      <Plus className='mr-2 h-4 w-4' />
      {t('add')}
    </Button>
  );

  const countersTableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>{t('name')}</TableHead>
        <TableHead>{t('assigned_to')}</TableHead>
        <TableHead className='w-[100px]'>{t('actions')}</TableHead>
      </TableRow>
    </TableHeader>
  );

  const tablePart = isLoading ? (
    <div>{tGeneral('loading', { defaultValue: 'Loading...' })}</div>
  ) : isError ? (
    <Table>
      {countersTableHeader}
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={3}
            className='text-destructive text-center text-sm'
            role='alert'
          >
            {t('list_load_error', {
              message: formatApiToastErrorMessage(error, tCommon('error'))
            })}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ) : (
    <Table>
      {countersTableHeader}
      <TableBody>
        {counters?.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={3}
              className='text-muted-foreground text-center'
            >
              {t('no_counters')}
            </TableCell>
          </TableRow>
        ) : (
          counters?.map((counter) => (
            <TableRow key={counter.id}>
              <TableCell className='font-medium'>{counter.name}</TableCell>
              <TableCell>{counter.assignedTo || '-'}</TableCell>
              <TableCell>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={t('edit_aria', { name: counter.name })}
                    onClick={() => handleEdit(counter)}
                  >
                    <Pencil className='h-4 w-4' aria-hidden />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='text-destructive hover:text-destructive'
                    aria-label={t('delete_aria', { name: counter.name })}
                    onClick={() => handleDelete(counter)}
                  >
                    <Trash2 className='h-4 w-4' aria-hidden />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const dialogs = (
    <>
      <CounterDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        countersUnitId={countersUnitId}
        serviceZoneFilter={serviceZoneFilter}
        counter={editingCounter}
      />

      <Dialog
        open={!!deletingCounter}
        onOpenChange={(open) => !open && setDeletingCounter(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete_confirm_title')}</DialogTitle>
            <DialogDescription>
              {deletingCounter &&
                t('delete_confirm_desc', { name: deletingCounter.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeletingCounter(null)}>
              {tGeneral('cancel')}
            </Button>
            <Button variant='destructive' onClick={confirmDelete}>
              {tGeneral('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {addButton}
        </CardHeader>
        <CardContent>{tablePart}</CardContent>
        {dialogs}
      </Card>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {hideEmbeddedHeading ? (
        <div className='flex justify-end'>{addButton}</div>
      ) : (
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0 space-y-1'>
            {embeddedHeading ? (
              <h4 className='text-base font-semibold'>{embeddedHeading}</h4>
            ) : null}
            {embeddedDescription ? (
              <p className='text-muted-foreground text-sm'>
                {embeddedDescription}
              </p>
            ) : null}
          </div>
          {addButton}
        </div>
      )}
      {tablePart}
      {dialogs}
    </div>
  );
}

interface CountersListProps {
  /** Subdivision id for counters API (use parent subdivision when editing a service zone unit). */
  unitId: string;
  /** When set, list/create counters on `unitId` but only for this service zone (zone’s own unit id). */
  restrictToServiceZoneId?: string;
}

export function CountersList({
  unitId,
  restrictToServiceZoneId
}: CountersListProps) {
  return (
    <UnitCountersSection
      countersUnitId={unitId}
      variant='card'
      serviceZoneFilter={
        restrictToServiceZoneId === undefined
          ? undefined
          : restrictToServiceZoneId
      }
    />
  );
}
