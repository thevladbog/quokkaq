'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogItem } from '@quokkaq/shared-types';
import { platformApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  formatPriceMinorUnits,
  minorUnitsToAmountInputString,
  parseAmountStringToMinorUnits
} from '@/lib/format-price';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';

const emptyForm = () => ({
  name: '',
  printName: '',
  unit: 'шт',
  article: '',
  defaultPriceInput: '',
  currency: 'RUB',
  vatExempt: false,
  vatRatePercent: '20',
  subscriptionPlanId: '',
  isActive: true
});

export default function PlatformCatalogItemsPage() {
  const t = useTranslations('platform.catalog');
  const appLocale = useLocale();
  const intlLocale = useMemo(
    () => intlLocaleFromAppLocale(appLocale),
    [appLocale]
  );
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState(() => emptyForm());

  const {
    data,
    isLoading,
    isError: catalogIsError,
    error: catalogError
  } = useQuery({
    queryKey: ['platform-catalog-items'],
    queryFn: () => platformApi.listCatalogItems({ limit: 500 })
  });

  const {
    data: plans = [],
    isError: plansIsError,
    error: plansError,
    isLoading: plansLoading
  } = useQuery({
    queryKey: ['platform-subscription-plans', 'catalog'],
    queryFn: () => platformApi.listSubscriptionPlans()
  });

  const items = data?.items ?? [];

  const openCreate = () => {
    saveMut.reset();
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (item: CatalogItem) => {
    saveMut.reset();
    setEditing(item);
    setForm({
      name: item.name,
      printName: item.printName,
      unit: item.unit,
      article: item.article ?? '',
      defaultPriceInput: minorUnitsToAmountInputString(
        item.defaultPriceMinor,
        item.currency || 'RUB',
        appLocale
      ),
      currency: item.currency || 'RUB',
      vatExempt: item.vatExempt,
      vatRatePercent:
        typeof item.vatRatePercent === 'number' &&
        Number.isFinite(item.vatRatePercent)
          ? String(item.vatRatePercent)
          : '20',
      subscriptionPlanId: item.subscriptionPlanId ?? '',
      isActive: item.isActive !== false
    });
    setDialogOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const cur = String(form.currency ?? 'RUB').trim() || 'RUB';
      const price = parseAmountStringToMinorUnits(
        form.defaultPriceInput,
        cur,
        intlLocale
      );
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(t('validationPrice'));
      }
      let vatRate: number;
      if (form.vatExempt) {
        vatRate = 0;
      } else {
        const parsed = Number.parseFloat(form.vatRatePercent.trim());
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          throw new Error(t('validationVatRate'));
        }
        vatRate = parsed;
      }
      const planPart = form.subscriptionPlanId.trim();
      const base = {
        name: form.name.trim(),
        printName: form.printName.trim() || form.name.trim(),
        unit: form.unit.trim() || 'шт',
        article: form.article.trim(),
        defaultPriceMinor: price,
        currency: cur,
        vatExempt: form.vatExempt,
        vatRatePercent: vatRate,
        isActive: form.isActive
      };
      if (editing) {
        return platformApi.patchCatalogItem(editing.id, {
          ...base,
          subscriptionPlanId: planPart ? planPart : null
        });
      }
      return platformApi.createCatalogItem({
        ...base,
        subscriptionPlanId: planPart ? planPart : null
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-catalog-items'] });
      setDialogOpen(false);
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => platformApi.deleteCatalogItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-catalog-items'] });
    },
    onError: (err: Error) => {
      toast.error(
        `${t('deleteFailed')}: ${err.message || t('deleteFailedGeneric')}`
      );
    }
  });

  const errorMsg = (saveMut.error as Error)?.message;

  const planById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plans) m.set(p.id, p.name);
    return m;
  }, [plans]);

  return (
    <div>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
        <h1 className='text-3xl font-bold'>{t('title')}</h1>
        <Button onClick={openCreate}>{t('add')}</Button>
      </div>

      {catalogIsError && (
        <p className='text-destructive mb-4 text-sm' role='alert'>
          {t('loadCatalogError')}{' '}
          <span className='font-mono text-xs'>
            {(catalogError as Error)?.message ?? ''}
          </span>
        </p>
      )}

      {plansIsError && (
        <p className='text-destructive mb-4 text-sm' role='alert'>
          {t('loadPlansErrorCatalog')}{' '}
          <span className='font-mono text-xs'>
            {(plansError as Error)?.message ?? ''}
          </span>
        </p>
      )}

      {isLoading && (
        <div className='flex justify-center py-12'>
          <Spinner className='h-8 w-8' />
        </div>
      )}

      {data && !catalogIsError && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('unit')}</TableHead>
              <TableHead>{t('priceGross')}</TableHead>
              <TableHead>{t('vat')}</TableHead>
              <TableHead>{t('plan')}</TableHead>
              <TableHead>{t('active')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className='font-medium'>{item.name}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className='text-sm'>
                  {formatPriceMinorUnits(
                    item.defaultPriceMinor,
                    item.currency || 'RUB',
                    intlLocale
                  )}
                </TableCell>
                <TableCell className='text-sm'>
                  {item.vatExempt
                    ? t('vatExemptShort')
                    : `${item.vatRatePercent}%`}
                </TableCell>
                <TableCell className='text-sm'>
                  {item.subscriptionPlanId
                    ? (planById.get(item.subscriptionPlanId) ??
                      item.subscriptionPlanId.slice(0, 8))
                    : '—'}
                </TableCell>
                <TableCell>
                  {item.isActive !== false ? t('yes') : t('no')}
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      onClick={() => openEdit(item)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='text-destructive'
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (
                          typeof window !== 'undefined' &&
                          window.confirm(t('confirmDelete'))
                        ) {
                          deleteMut.mutate(item.id);
                        }
                      }}
                    >
                      {deleteMut.isPending &&
                      deleteMut.variables === item.id ? (
                        <Spinner className='h-4 w-4' />
                      ) : (
                        t('delete')
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editTitle') : t('createTitle')}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {t('dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4 py-1'>
            <div className='grid min-w-0 gap-2'>
              <Label htmlFor='cat-name'>{t('fieldName')}</Label>
              <Input
                id='cat-name'
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className='grid min-w-0 gap-2'>
              <Label htmlFor='cat-print'>{t('fieldPrintName')}</Label>
              <Input
                id='cat-print'
                value={form.printName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, printName: e.target.value }))
                }
              />
            </div>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-4'>
              <div className='grid min-w-0 gap-2'>
                <Label htmlFor='cat-unit'>{t('fieldUnit')}</Label>
                <Input
                  id='cat-unit'
                  value={form.unit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unit: e.target.value }))
                  }
                />
              </div>
              <div className='grid min-w-0 gap-2'>
                <Label htmlFor='cat-article'>{t('fieldArticle')}</Label>
                <Input
                  id='cat-article'
                  value={form.article}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, article: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className='flex flex-col gap-2'>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-4'>
                <div className='grid min-w-0 gap-2'>
                  <Label htmlFor='cat-price'>{t('fieldPriceGross')}</Label>
                  <Input
                    id='cat-price'
                    inputMode='decimal'
                    autoComplete='off'
                    placeholder={t('fieldPricePlaceholder')}
                    aria-describedby='cat-price-hint'
                    value={form.defaultPriceInput}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        defaultPriceInput: e.target.value
                      }))
                    }
                  />
                </div>
                <div className='grid min-w-0 gap-2'>
                  <Label htmlFor='cat-currency'>{t('fieldCurrency')}</Label>
                  <Input
                    id='cat-currency'
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        currency: e.target.value.toUpperCase()
                      }))
                    }
                  />
                </div>
              </div>
              <p
                id='cat-price-hint'
                className='text-muted-foreground text-xs leading-snug sm:max-w-[min(100%,calc(50%-0.5rem))]'
              >
                {t('fieldPriceHint')}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Checkbox
                id='vat-exempt'
                checked={form.vatExempt}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, vatExempt: v === true }))
                }
              />
              <Label
                htmlFor='vat-exempt'
                className='cursor-pointer font-normal'
              >
                {t('fieldVatExempt')}
              </Label>
            </div>
            {!form.vatExempt && (
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-4'>
                <div className='grid min-w-0 gap-2'>
                  <Label htmlFor='cat-vat-rate'>{t('fieldVatRate')}</Label>
                  <Input
                    id='cat-vat-rate'
                    inputMode='decimal'
                    className='w-full'
                    value={form.vatRatePercent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vatRatePercent: e.target.value }))
                    }
                  />
                </div>
                <div className='hidden sm:block' aria-hidden />
              </div>
            )}
            <div className='grid min-w-0 gap-2'>
              <Label>{t('fieldPlan')}</Label>
              <Select
                value={form.subscriptionPlanId || '__none__'}
                disabled={plansIsError || plansLoading}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    subscriptionPlanId: v === '__none__' ? '' : v
                  }))
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('planNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='__none__'>{t('planNone')}</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center gap-2'>
              <Checkbox
                id='active'
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isActive: v === true }))
                }
              />
              <Label htmlFor='active' className='cursor-pointer font-normal'>
                {t('fieldActive')}
              </Label>
            </div>
            {errorMsg && <p className='text-destructive text-sm'>{errorMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant='secondary' onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={saveMut.isPending || !form.name.trim()}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending && <Spinner className='mr-2 h-4 w-4' />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className='text-muted-foreground mt-8 text-sm'>
        <Link href='/platform/invoices' className='underline'>
          {t('backInvoices')}
        </Link>
      </p>
    </div>
  );
}
