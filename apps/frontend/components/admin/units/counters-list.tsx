'use client';

import { useState } from 'react';
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
import { CounterDialog } from './counter-dialog';

interface CountersListProps {
  unitId: string;
}

export function CountersList({ unitId }: CountersListProps) {
  const t = useTranslations('admin.counters');
  const tGeneral = useTranslations('general');
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null);
  const [deletingCounter, setDeletingCounter] = useState<Counter | null>(null);

  const { data: counters, isLoading } = useQuery({
    queryKey: ['counters', unitId],
    queryFn: () => countersApi.getByUnitId(unitId)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => countersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters', unitId] });
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

  if (isLoading) {
    return <div>{tGeneral('loading', { defaultValue: 'Loading...' })}</div>;
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </div>
        <Button onClick={handleAdd} size='sm'>
          <Plus className='mr-2 h-4 w-4' />
          {t('add')}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('assigned_to')}</TableHead>
              <TableHead className='w-[100px]'>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
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
                        onClick={() => handleEdit(counter)}
                      >
                        <Pencil className='h-4 w-4' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='text-destructive hover:text-destructive'
                        onClick={() => handleDelete(counter)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <CounterDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        unitId={unitId}
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
    </Card>
  );
}
