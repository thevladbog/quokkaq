'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { countersApi, Counter } from '@/lib/api';

interface CounterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  counter?: Counter | null;
}

export function CounterDialog({
  open,
  onOpenChange,
  unitId,
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
            unitId={unitId}
            counter={counter}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CounterForm({
  unitId,
  counter,
  onOpenChange
}: {
  unitId: string;
  counter?: Counter | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('admin.counters');
  const tGeneral = useTranslations('general');
  const queryClient = useQueryClient();
  const isEditing = !!counter;
  const [name, setName] = useState(counter?.name || '');

  const createMutation = useMutation({
    mutationFn: (data: { name: string }) => countersApi.create(unitId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters', unitId] });
      toast.success(t('created_success'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(t('created_error', { error: error.message }));
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) =>
      countersApi.update(counter!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters', unitId] });
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

    if (isEditing) {
      updateMutation.mutate({ name });
    } else {
      createMutation.mutate({ name });
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
