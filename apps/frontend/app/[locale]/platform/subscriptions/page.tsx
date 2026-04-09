'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { Combobox } from '@/components/ui/combobox';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  formatAppDateTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';

const SUB_STATUSES = [
  'trial',
  'active',
  'past_due',
  'canceled',
  'paused'
] as const;

const STATUS_SELECT_DEFAULT = '__default__';

/** Next calendar month, clamping the day to the last day of the target month (avoids Jan 31 → Mar 3). */
function addOneCalendarMonthClamped(from: Date): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const day = from.getDate();
  const lastDayOfTargetMonth = new Date(y, m + 2, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(
    y,
    m + 1,
    clampedDay,
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

function subscriptionStatusLabel(
  tBilling: ReturnType<typeof useTranslations<'organization.billing'>>,
  code: string
) {
  return tBilling(`status.${code}`, { defaultValue: code });
}

export default function PlatformSubscriptionsPage() {
  const t = useTranslations('platform.subscriptions');
  const tBilling = useTranslations('organization.billing');
  const tGeneral = useTranslations('general');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [planId, setPlanId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [subStatusSelect, setSubStatusSelect] = useState(STATUS_SELECT_DEFAULT);
  const [createWithInvoice, setCreateWithInvoice] = useState(false);
  const [invAmount, setInvAmount] = useState('');
  const [invDue, setInvDue] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-subscriptions', 'list'],
    queryFn: () => platformApi.listSubscriptions({ limit: 200 })
  });

  const {
    data: companiesData,
    isError: companiesError,
    isLoading: companiesLoading
  } = useQuery({
    queryKey: ['platform-companies', 'create-sub'],
    queryFn: () => platformApi.listCompanies({ limit: 100 }),
    enabled: createOpen
  });

  const companyOptions = useMemo(() => {
    return (companiesData?.items ?? []).map((c) => {
      const hasSub =
        c.subscriptionId != null && String(c.subscriptionId).trim() !== '';
      const idShort = `${c.id.slice(0, 8)}…`;
      return {
        value: c.id,
        label: hasSub
          ? `${c.name} (${idShort}) — ${t('companyHasSubscription')}`
          : `${c.name} (${idShort})`,
        keywords: [c.name, c.id],
        disabled: hasSub
      };
    });
  }, [companiesData?.items, t]);

  const selectedCompanyHasSubscription = useMemo(() => {
    const c = companiesData?.items?.find((x) => x.id === companyId);
    return !!(c?.subscriptionId && String(c.subscriptionId).trim());
  }, [companiesData?.items, companyId]);

  const { data: plans = [], isError: plansError } = useQuery({
    queryKey: ['platform-subscription-plans', 'create-sub'],
    queryFn: () => platformApi.listSubscriptionPlans(),
    enabled: createOpen
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!companyId || !planId) {
        throw new Error(t('validationCompanyPlan'));
      }
      if (selectedCompanyHasSubscription) {
        throw new Error(t('createSubCompanyHasSubscription'));
      }

      const body: {
        companyId: string;
        planId: string;
        status?: string;
        currentPeriodStart?: string;
        currentPeriodEnd?: string;
      } = { companyId, planId };

      if (subStatusSelect !== STATUS_SELECT_DEFAULT) {
        body.status = subStatusSelect;
      }

      const hasStart = periodStart.trim() !== '';
      const hasEnd = periodEnd.trim() !== '';
      if (hasStart !== hasEnd) {
        throw new Error(t('periodBothOrNeither'));
      }
      if (hasStart && hasEnd) {
        const s = new Date(periodStart);
        const e = new Date(periodEnd);
        if (
          Number.isNaN(s.getTime()) ||
          Number.isNaN(e.getTime()) ||
          e.getTime() <= s.getTime()
        ) {
          throw new Error(t('periodOrderInvalid'));
        }
        body.currentPeriodStart = s.toISOString();
        body.currentPeriodEnd = e.toISOString();
      }

      if (createWithInvoice) {
        const amount = Number.parseFloat(invAmount.trim());
        const dueRaw = invDue.trim();
        const dueDate = new Date(dueRaw);
        if (
          !Number.isFinite(amount) ||
          !Number.isInteger(amount) ||
          amount <= 0 ||
          dueRaw === '' ||
          Number.isNaN(dueDate.getTime())
        ) {
          throw new Error(t('invoiceWithSubValidation'));
        }
        const due = dueDate.toISOString();

        let currentPeriodStart: string;
        let currentPeriodEnd: string;
        if (body.currentPeriodStart && body.currentPeriodEnd) {
          currentPeriodStart = body.currentPeriodStart;
          currentPeriodEnd = body.currentPeriodEnd;
        } else {
          const now = new Date();
          const endDefault = addOneCalendarMonthClamped(now);
          currentPeriodStart = now.toISOString();
          currentPeriodEnd = endDefault.toISOString();
        }

        return platformApi.createInvoice({
          companyId,
          amount,
          dueDate: due,
          status: 'open',
          paymentProvider: 'manual',
          createSubscriptionWithInvoice: true,
          subscription: {
            planId,
            currentPeriodStart,
            currentPeriodEnd,
            ...(subStatusSelect !== STATUS_SELECT_DEFAULT
              ? { status: subStatusSelect }
              : {})
          }
        });
      }

      return platformApi.createSubscription(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-subscriptions'] });
      qc.invalidateQueries({ queryKey: ['platform-company'] });
      qc.invalidateQueries({ queryKey: ['platform-invoices'] });
      setCreateOpen(false);
      setCompanyId('');
      setPlanId('');
      setPeriodStart('');
      setPeriodEnd('');
      setSubStatusSelect(STATUS_SELECT_DEFAULT);
      setCreateWithInvoice(false);
      setInvAmount('');
      setInvDue('');
    }
  });

  const openDialog = () => {
    setCompanyId('');
    setPlanId('');
    setPeriodStart('');
    setPeriodEnd('');
    setSubStatusSelect(STATUS_SELECT_DEFAULT);
    setCreateWithInvoice(false);
    setInvAmount('');
    setInvDue('');
    createMut.reset();
    setCreateOpen(true);
  };

  return (
    <div>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-4'>
        <h1 className='text-3xl font-bold'>
          {t('title', { defaultValue: 'Subscriptions' })}
        </h1>
        <Button type='button' onClick={openDialog}>
          {t('create', { defaultValue: 'New subscription' })}
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {t('createTitle', { defaultValue: 'Create subscription' })}
            </DialogTitle>
            <DialogDescription>
              {t('createDescription', {
                defaultValue:
                  'Assign a plan to an organization that does not have a subscription row yet.'
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>
            {companiesError && (
              <p className='text-destructive text-sm'>
                {t('loadCompaniesError')}
              </p>
            )}
            {plansError && (
              <p className='text-destructive text-sm'>{t('loadPlansError')}</p>
            )}
            <div className='space-y-2'>
              <Label>
                {t('selectCompany', { defaultValue: 'Organization' })}
              </Label>
              <Combobox
                options={companyOptions}
                value={companyId || undefined}
                onChange={setCompanyId}
                placeholder={
                  companiesLoading
                    ? tGeneral('loading')
                    : t('selectPlaceholder', { defaultValue: 'Select…' })
                }
                searchPlaceholder={t('searchCompanyPlaceholder')}
                emptyText={t('emptyCompanySearch')}
                disabled={companiesLoading || !!companiesError}
              />
              {selectedCompanyHasSubscription && (
                <p className='text-muted-foreground text-xs'>
                  ⓘ {t('companyHasSubscriptionInfo')}
                </p>
              )}
            </div>
            <div className='space-y-2'>
              <Label>{t('selectPlan', { defaultValue: 'Plan' })}</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t('selectPlaceholder', {
                      defaultValue: 'Select…'
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className='text-muted-foreground text-xs'>
              {t('periodOptionalHint')}
            </p>
            <div className='grid gap-2'>
              <Label>{t('periodStart')}</Label>
              <DateTimePicker value={periodStart} onChange={setPeriodStart} />
            </div>
            <div className='grid gap-2'>
              <Label>{t('periodEndUtc')}</Label>
              <DateTimePicker value={periodEnd} onChange={setPeriodEnd} />
            </div>

            <div className='space-y-2'>
              <Label>
                {t('subscriptionStatusOptional', {
                  defaultValue: 'Subscription status'
                })}
              </Label>
              <Select
                value={subStatusSelect}
                onValueChange={setSubStatusSelect}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STATUS_SELECT_DEFAULT}>
                    {t('statusDefaultActive')}
                  </SelectItem>
                  {SUB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {subscriptionStatusLabel(tBilling, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='border-t pt-4'>
              <div className='flex items-start space-x-2'>
                <Checkbox
                  id='sub-create-invoice'
                  checked={createWithInvoice}
                  onCheckedChange={(v) => setCreateWithInvoice(v === true)}
                />
                <div className='grid gap-1 leading-none'>
                  <Label
                    htmlFor='sub-create-invoice'
                    className='cursor-pointer text-sm font-medium'
                  >
                    {t('createManualInvoiceWithSub')}
                  </Label>
                  <p className='text-muted-foreground text-xs'>
                    {t('createManualInvoiceHint')}
                  </p>
                </div>
              </div>
              {createWithInvoice && (
                <div className='mt-4 space-y-4'>
                  <div className='grid gap-2'>
                    <Label>{t('invoiceAmountMinor')}</Label>
                    <Input
                      type='number'
                      min={1}
                      value={invAmount}
                      onChange={(e) => setInvAmount(e.target.value)}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label>{t('invoiceDueDate')}</Label>
                    <DateTimePicker value={invDue} onChange={setInvDue} />
                  </div>
                </div>
              )}
            </div>
          </div>
          {createMut.isError && (
            <p className='text-destructive text-sm'>
              {(createMut.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setCreateOpen(false)}
            >
              {tGeneral('cancel')}
            </Button>
            <Button
              type='button'
              disabled={
                createMut.isPending || !companyId || !planId || companiesLoading
              }
              onClick={() => createMut.mutate()}
            >
              {t('submitCreate', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <div className='flex justify-center py-12'>
          <Spinner className='h-8 w-8' />
        </div>
      )}
      {data && data.items.length === 0 && (
        <p className='text-muted-foreground mb-4 text-sm'>
          {t('emptyListHint', {
            defaultValue:
              'No subscriptions yet. Create one for an organization without billing.'
          })}
        </p>
      )}
      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('company', { defaultValue: 'Company' })}</TableHead>
              <TableHead>{t('plan', { defaultValue: 'Plan' })}</TableHead>
              <TableHead>{t('status', { defaultValue: 'Status' })}</TableHead>
              <TableHead>
                {t('periodEnd', { defaultValue: 'Period end' })}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    href={`/platform/companies/${s.companyId}`}
                    className='text-primary font-mono text-xs underline'
                  >
                    {s.companyId.slice(0, 8)}…
                  </Link>
                </TableCell>
                <TableCell>{s.plan?.name ?? s.planId}</TableCell>
                <TableCell>{s.status}</TableCell>
                <TableCell className='text-sm'>
                  {formatAppDateTime(s.currentPeriodEnd, intlLocale)}
                </TableCell>
                <TableCell className='text-right'>
                  <Button variant='outline' size='sm' asChild>
                    <Link href={`/platform/companies/${s.companyId}`}>
                      {t('openCompany', { defaultValue: 'Company' })}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
