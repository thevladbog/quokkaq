'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '@/lib/api';
import type { SubscriptionPlan } from '@quokkaq/shared-types';
import { Button } from '@/components/ui/button';
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
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { formatPriceMinorUnits } from '@/lib/format-price';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';

function emptyForm() {
  return {
    name: '',
    code: '',
    price: '',
    currency: 'RUB',
    interval: 'month' as 'month' | 'year',
    isActive: true
  };
}

export default function PlatformPlansPage() {
  const t = useTranslations('platform.plans');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => platformApi.listSubscriptionPlans()
  });

  const [openCreate, setOpenCreate] = useState(false);
  const [editPlan, setEditPlan] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(emptyForm());

  const createMut = useMutation({
    mutationFn: () =>
      platformApi.createSubscriptionPlan({
        name: form.name.trim(),
        code: form.code.trim().toLowerCase(),
        price: parseInt(form.price, 10) || 0,
        currency: form.currency || 'RUB',
        interval: form.interval,
        features: {},
        limits: {},
        isActive: form.isActive
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
      setOpenCreate(false);
      setForm(emptyForm());
    }
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editPlan) throw new Error('no plan');
      return platformApi.updateSubscriptionPlan(editPlan.id, {
        name: form.name.trim(),
        code: form.code.trim().toLowerCase(),
        price: parseInt(form.price, 10) || 0,
        currency: form.currency || 'RUB',
        interval: form.interval,
        features: editPlan.features ?? {},
        limits: editPlan.limits ?? {},
        isActive: form.isActive
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
      setEditPlan(null);
      setForm(emptyForm());
    }
  });

  const openEdit = (p: SubscriptionPlan) => {
    setEditPlan(p);
    setForm({
      name: p.name,
      code: p.code,
      price: String(p.price),
      currency: p.currency,
      interval: p.interval as 'month' | 'year',
      isActive: p.isActive
    });
  };

  const FormFields = (
    <>
      <div className='grid gap-2'>
        <Label>{t('name', { defaultValue: 'Name' })}</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label>{t('code', { defaultValue: 'Code' })}</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label>{t('priceMinor', { defaultValue: 'Price (minor units)' })}</Label>
        <Input
          type='number'
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label>{t('currency', { defaultValue: 'Currency' })}</Label>
        <Input
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label>{t('interval', { defaultValue: 'Interval' })}</Label>
        <select
          className='border-input bg-background h-9 w-full rounded-md border px-2 text-sm'
          value={form.interval}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              interval: e.target.value as 'month' | 'year'
            }))
          }
        >
          <option value='month'>month</option>
          <option value='year'>year</option>
        </select>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={form.isActive}
          onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
        />
        <Label>{t('active', { defaultValue: 'Active' })}</Label>
      </div>
    </>
  );

  return (
    <div>
      <div className='mb-6 flex items-center justify-between gap-4'>
        <h1 className='text-3xl font-bold'>
          {t('title', { defaultValue: 'Subscription plans' })}
        </h1>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <Button
            onClick={() => {
              setForm(emptyForm());
              setOpenCreate(true);
            }}
          >
            {t('create', { defaultValue: 'New plan' })}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('createTitle', { defaultValue: 'Create plan' })}
              </DialogTitle>
            </DialogHeader>
            <div className='grid gap-4 py-2'>{FormFields}</div>
            <DialogFooter>
              <Button
                disabled={createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {t('submit', { defaultValue: 'Save' })}
              </Button>
            </DialogFooter>
            {createMut.isError && (
              <p className='text-destructive text-sm'>
                {(createMut.error as Error).message}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className='flex justify-center py-12'>
          <Spinner className='h-8 w-8' />
        </div>
      )}

      {plans && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name', { defaultValue: 'Name' })}</TableHead>
              <TableHead>{t('code', { defaultValue: 'Code' })}</TableHead>
              <TableHead>
                {t('priceColumn', { defaultValue: 'Price' })}
              </TableHead>
              <TableHead>{t('interval', { defaultValue: 'Interval' })}</TableHead>
              <TableHead>{t('active', { defaultValue: 'Active' })}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell className='font-mono text-sm'>{p.code}</TableCell>
                <TableCell className='font-medium'>
                  {formatPriceMinorUnits(p.price, p.currency, intlLocale)}
                </TableCell>
                <TableCell>{p.interval}</TableCell>
                <TableCell>{p.isActive ? '✓' : '—'}</TableCell>
                <TableCell className='text-right'>
                  <Button variant='outline' size='sm' onClick={() => openEdit(p)}>
                    {t('edit', { defaultValue: 'Edit' })}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editPlan} onOpenChange={(o) => !o && setEditPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('editTitle', { defaultValue: 'Edit plan' })}
            </DialogTitle>
          </DialogHeader>
          <div className='grid gap-4 py-2'>{FormFields}</div>
          <DialogFooter>
            <Button
              disabled={updateMut.isPending}
              onClick={() => updateMut.mutate()}
            >
              {t('submit', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
          {updateMut.isError && (
            <p className='text-destructive text-sm'>
              {(updateMut.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
