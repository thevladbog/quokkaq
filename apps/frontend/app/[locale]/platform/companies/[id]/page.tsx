'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { platformApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Link } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  intlLocaleFromAppLocale,
  toDateTimeLocalString
} from '@/lib/format-datetime';
import {
  CounterpartySchema,
  type Counterparty,
  type Subscription,
  type SubscriptionPlan
} from '@quokkaq/shared-types';
import {
  CounterpartyForm,
  parseCounterpartyFromApi
} from '@/components/organization/CounterpartyForm';

const SUB_STATUSES = [
  'trial',
  'active',
  'past_due',
  'canceled',
  'paused'
] as const;

function subscriptionStatusLabel(
  tBilling: ReturnType<typeof useTranslations<'organization.billing'>>,
  code: string
) {
  return tBilling(`status.${code}`, { defaultValue: code });
}

function subscriptionFormSyncKey(sub: Subscription): string {
  return [
    sub.id,
    sub.status,
    sub.currentPeriodStart,
    sub.currentPeriodEnd,
    sub.planId,
    sub.pendingPlanId ?? '',
    sub.pendingEffectiveAt ?? '',
    sub.updatedAt ?? ''
  ].join('\u001f');
}

type PlatformSubscriptionEditorProps = {
  sub: Subscription;
  companyId: string;
  intlLocale: string;
  subscriptionPlans: SubscriptionPlan[];
  t: ReturnType<typeof useTranslations<'platform.companyDetail'>>;
  tBilling: ReturnType<typeof useTranslations<'organization.billing'>>;
  qc: ReturnType<typeof useQueryClient>;
};

function PlatformSubscriptionEditor({
  sub,
  companyId,
  intlLocale,
  subscriptionPlans,
  t,
  tBilling,
  qc
}: PlatformSubscriptionEditorProps) {
  const [status, setStatus] = useState<string>(sub.status);
  const [periodStart, setPeriodStart] = useState(() =>
    toDateTimeLocalString(sub.currentPeriodStart)
  );
  const [periodEnd, setPeriodEnd] = useState(() =>
    toDateTimeLocalString(sub.currentPeriodEnd)
  );
  const [planMode, setPlanMode] = useState<'immediate' | 'scheduled'>(
    'immediate'
  );
  const [immediatePlanId, setImmediatePlanId] = useState(sub.planId);
  const [deferredPlanId, setDeferredPlanId] = useState(
    sub.pendingPlanId ?? sub.planId
  );
  const [deferredEffectiveAt, setDeferredEffectiveAt] = useState(() =>
    sub.pendingEffectiveAt ? toDateTimeLocalString(sub.pendingEffectiveAt) : ''
  );

  const patchSub = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (status && status !== sub.status) body.status = status;
      if (periodStart) {
        body.currentPeriodStart = new Date(periodStart).toISOString();
      }
      if (periodEnd) {
        body.currentPeriodEnd = new Date(periodEnd).toISOString();
      }

      if (planMode === 'immediate') {
        if (!immediatePlanId) {
          throw new Error(t('planSelectRequired'));
        }
        const hasPending = !!(sub.pendingPlanId && sub.pendingEffectiveAt);
        if (immediatePlanId !== sub.planId || hasPending) {
          body.planId = immediatePlanId;
        }
      } else {
        const pendingUnchanged =
          !!sub.pendingPlanId &&
          !!sub.pendingEffectiveAt &&
          deferredPlanId === sub.pendingPlanId &&
          !!deferredEffectiveAt &&
          new Date(deferredEffectiveAt).getTime() ===
            new Date(sub.pendingEffectiveAt).getTime();

        if (!pendingUnchanged) {
          if (!deferredPlanId) {
            throw new Error(t('planSelectRequired'));
          }
          if (!deferredEffectiveAt) {
            throw new Error(t('effectiveAtRequired'));
          }
          const eff = new Date(deferredEffectiveAt);
          if (Number.isNaN(eff.getTime())) {
            throw new Error(t('effectiveAtRequired'));
          }
          if (eff.getTime() <= Date.now()) {
            throw new Error(t('effectiveAtFuture'));
          }
          body.pendingPlanId = deferredPlanId;
          body.pendingEffectiveAt = eff.toISOString();
        }
      }

      if (Object.keys(body).length === 0) {
        throw new Error(t('nothingToSave'));
      }

      return platformApi.patchSubscription(sub.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-company', companyId] });
    }
  });

  const clearPendingMut = useMutation({
    mutationFn: () =>
      platformApi.patchSubscription(sub.id, { clearPending: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-company', companyId] });
    }
  });

  return (
    <div className='space-y-4'>
      <p className='text-sm'>
        <span className='text-muted-foreground'>
          {t('currentPlan', { defaultValue: 'Current plan' })}:{' '}
        </span>
        {sub.plan?.name ?? sub.planId}
      </p>
      {sub.pendingPlanId && sub.pendingEffectiveAt && (
        <p className='text-muted-foreground text-sm'>
          {t('pendingScheduled', {
            plan: sub.pendingPlan?.name ?? sub.pendingPlanId,
            at: new Intl.DateTimeFormat(intlLocale, {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'UTC'
            }).format(new Date(sub.pendingEffectiveAt))
          })}
        </p>
      )}
      <div className='space-y-2'>
        <Label>{t('planChangeMode', { defaultValue: 'Plan change' })}</Label>
        <Select
          value={planMode}
          onValueChange={(v) => setPlanMode(v as 'immediate' | 'scheduled')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='immediate'>
              {t('planModeImmediate', { defaultValue: 'Apply now' })}
            </SelectItem>
            <SelectItem value='scheduled'>
              {t('planModeScheduled', {
                defaultValue: 'From date/time (UTC)'
              })}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-2'>
        <Label>{t('selectPlan', { defaultValue: 'Target plan' })}</Label>
        <Select
          value={planMode === 'immediate' ? immediatePlanId : deferredPlanId}
          onValueChange={(v) =>
            planMode === 'immediate'
              ? setImmediatePlanId(v)
              : setDeferredPlanId(v)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {subscriptionPlans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {planMode === 'scheduled' && (
        <div className='grid gap-2'>
          <Label>
            {t('effectiveAt', { defaultValue: 'Effective at (UTC)' })}
          </Label>
          <DateTimePicker
            value={deferredEffectiveAt}
            onChange={setDeferredEffectiveAt}
          />
        </div>
      )}
      {sub.pendingPlanId && sub.pendingEffectiveAt && (
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={clearPendingMut.isPending}
          onClick={() => clearPendingMut.mutate()}
        >
          {t('clearPending', {
            defaultValue: 'Clear scheduled change'
          })}
        </Button>
      )}
      {clearPendingMut.isError && (
        <p className='text-destructive text-sm'>
          {(clearPendingMut.error as Error).message}
        </p>
      )}
      <div className='space-y-2'>
        <Label>{t('status', { defaultValue: 'Status' })}</Label>
        <Select value={status || sub.status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {subscriptionStatusLabel(tBilling, s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-2'>
        <Label>{t('periodStart', { defaultValue: 'Period start' })}</Label>
        <DateTimePicker value={periodStart} onChange={setPeriodStart} />
      </div>
      <div className='grid gap-2'>
        <Label>{t('periodEnd', { defaultValue: 'Period end' })}</Label>
        <DateTimePicker value={periodEnd} onChange={setPeriodEnd} />
      </div>
      <Button disabled={patchSub.isPending} onClick={() => patchSub.mutate()}>
        {t('saveSubscription', { defaultValue: 'Save subscription' })}
      </Button>
      {patchSub.isError && (
        <p className='text-destructive text-sm'>
          {(patchSub.error as Error).message}
        </p>
      )}
    </div>
  );
}

type PlatformCounterpartySectionProps = {
  companyId: string;
  initialCounterparty: unknown;
  canUseDadata: boolean;
  canUseCleaner: boolean;
  t: ReturnType<typeof useTranslations<'platform.companyDetail'>>;
};

function PlatformCompanyCounterpartySection({
  companyId,
  initialCounterparty,
  canUseDadata,
  canUseCleaner,
  t
}: PlatformCounterpartySectionProps) {
  const qc = useQueryClient();
  const [counterparty, setCounterparty] = useState<Counterparty>(() =>
    parseCounterpartyFromApi(initialCounterparty)
  );

  const saveCounterparty = useMutation({
    mutationFn: async () => {
      const p = CounterpartySchema.safeParse(counterparty);
      if (!p.success) {
        const msg = p.error.issues.map((i) => i.message).join('; ');
        throw new Error(msg);
      }
      return platformApi.patchCompany(companyId, { counterparty: p.data });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-company', companyId] });
    }
  });

  return (
    <Card className='mt-6'>
      <CardHeader>
        <CardTitle>
          {t('counterpartyTitle', {
            defaultValue: 'Counterparty (RU legal profile)'
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <CounterpartyForm
          value={counterparty}
          onChange={setCounterparty}
          canUseDadata={canUseDadata}
          canUseCleaner={canUseCleaner}
          dadataScope='platform'
        />
        <Button
          disabled={saveCounterparty.isPending}
          onClick={() => saveCounterparty.mutate()}
        >
          {t('saveCounterparty', { defaultValue: 'Save counterparty' })}
        </Button>
        {saveCounterparty.isError && (
          <p className='text-destructive text-sm'>
            {(saveCounterparty.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlatformCompanyDetailPage() {
  const t = useTranslations('platform.companyDetail');
  const tBilling = useTranslations('organization.billing');
  const appLocale = useLocale();
  const intlLocale = intlLocaleFromAppLocale(appLocale);
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const qc = useQueryClient();

  const { data: company, isLoading } = useQuery({
    queryKey: ['platform-company', id],
    queryFn: () => platformApi.getCompany(id),
    enabled: !!id
  });

  const { data: platFeatures } = useQuery({
    queryKey: ['platform-features'],
    queryFn: () => platformApi.getFeatures(),
    enabled: !!company
  });

  const patchSaasOperator = useMutation({
    mutationFn: (next: boolean) =>
      platformApi.patchCompany(id, { isSaasOperator: next }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-company', id] });
      void qc.invalidateQueries({ queryKey: ['platform-companies'] });
    }
  });

  const sub = company?.subscription;
  const [invAmount, setInvAmount] = useState('');
  const [invDue, setInvDue] = useState('');
  const [invCreateWithSub, setInvCreateWithSub] = useState(false);
  const [invLinkToSub, setInvLinkToSub] = useState(false);
  const [invPlanId, setInvPlanId] = useState('');
  const [invSubStart, setInvSubStart] = useState('');
  const [invSubEnd, setInvSubEnd] = useState('');

  const { data: subscriptionPlans = [] } = useQuery({
    queryKey: ['platform-subscription-plans'],
    queryFn: () => platformApi.listSubscriptionPlans(),
    enabled: !!company
  });

  const createInv = useMutation({
    mutationFn: () => {
      if (!company) throw new Error(t('notFound'));
      const amount = parseInt(invAmount, 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t('invoiceAmountInvalid'));
      }
      const due = invDue ? new Date(invDue).toISOString() : '';
      if (!due) throw new Error(t('invoiceDueRequired'));

      if (invCreateWithSub) {
        if (sub) {
          throw new Error(t('invoiceCreateSubConflict'));
        }
        if (!invPlanId) {
          throw new Error(t('planSelectRequired'));
        }
        if (!invSubStart || !invSubEnd) {
          throw new Error(t('invoiceSubscriptionPeriodRequired'));
        }
        const pStart = new Date(invSubStart);
        const pEnd = new Date(invSubEnd);
        if (
          Number.isNaN(pStart.getTime()) ||
          Number.isNaN(pEnd.getTime()) ||
          pEnd.getTime() <= pStart.getTime()
        ) {
          throw new Error(t('invoiceSubscriptionPeriodOrder'));
        }
        return platformApi.createInvoice({
          companyId: company.id,
          amount,
          dueDate: due,
          status: 'open',
          paymentProvider: 'manual',
          createSubscriptionWithInvoice: true,
          subscription: {
            planId: invPlanId,
            currentPeriodStart: pStart.toISOString(),
            currentPeriodEnd: pEnd.toISOString()
          }
        });
      }

      return platformApi.createInvoice({
        companyId: company.id,
        ...(invLinkToSub && sub ? { subscriptionId: sub.id } : {}),
        amount,
        dueDate: due,
        status: 'open',
        paymentProvider: 'manual'
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-invoices'] });
      qc.invalidateQueries({ queryKey: ['platform-company', id] });
      setInvAmount('');
      setInvDue('');
      setInvCreateWithSub(false);
      setInvLinkToSub(false);
      setInvPlanId('');
      setInvSubStart('');
      setInvSubEnd('');
    }
  });

  if (!id) return null;

  if (isLoading) {
    return (
      <div className='flex justify-center py-16'>
        <Spinner className='h-10 w-10' />
      </div>
    );
  }

  if (!company) {
    return (
      <p className='text-destructive'>
        {t('notFound', { defaultValue: 'Not found' })}
      </p>
    );
  }

  return (
    <div>
      <div className='mb-6'>
        <Button variant='ghost' size='sm' asChild>
          <Link href='/platform/companies'>
            {t('back', { defaultValue: '← Companies' })}
          </Link>
        </Button>
      </div>
      <h1 className='mb-2 text-3xl font-bold'>{company.name}</h1>
      <p className='text-muted-foreground font-mono text-sm'>{company.id}</p>

      <Card className='border-primary/20 mt-6'>
        <CardHeader>
          <CardTitle>
            {t('saasOperatorTitle', {
              defaultValue: 'SaaS operator tenant'
            })}
          </CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-muted-foreground max-w-xl text-sm'>
            {t('saasOperatorDesc', {
              defaultValue:
                'One organization per deployment: unlimited resource quotas and the canonical legal profile for invoices and platform branding. Turning this on clears the flag on any other company.'
            })}
          </p>
          <Switch
            checked={company.isSaasOperator === true}
            disabled={patchSaasOperator.isPending}
            onCheckedChange={(v) => patchSaasOperator.mutate(v)}
          />
        </CardContent>
        {patchSaasOperator.isError && (
          <CardContent className='pt-0'>
            <p className='text-destructive text-sm'>
              {(patchSaasOperator.error as Error).message}
            </p>
          </CardContent>
        )}
      </Card>

      <div className='mt-8 grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('subscription', { defaultValue: 'Subscription' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!sub ? (
              <p className='text-muted-foreground'>
                {t('noSubscription', {
                  defaultValue: 'No subscription record.'
                })}
              </p>
            ) : (
              <PlatformSubscriptionEditor
                key={subscriptionFormSyncKey(sub)}
                sub={sub}
                companyId={id}
                intlLocale={intlLocale}
                subscriptionPlans={subscriptionPlans}
                t={t}
                tBilling={tBilling}
                qc={qc}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t('manualInvoice', { defaultValue: 'Manual invoice' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <p className='text-muted-foreground text-xs'>
                {t('amountHint', {
                  defaultValue:
                    'Amount in minor units (e.g. 10000 = 100.00 RUB).'
                })}
              </p>
              <div className='grid gap-2'>
                <Label>{t('amount', { defaultValue: 'Amount' })}</Label>
                <Input
                  type='number'
                  min={1}
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label>{t('dueDate', { defaultValue: 'Due date' })}</Label>
                <DateTimePicker value={invDue} onChange={setInvDue} />
              </div>

              {!sub && (
                <div className='flex items-start space-x-2'>
                  <Checkbox
                    id='inv-create-sub'
                    checked={invCreateWithSub}
                    onCheckedChange={(v) => setInvCreateWithSub(v === true)}
                  />
                  <div className='grid gap-1 leading-none'>
                    <Label
                      htmlFor='inv-create-sub'
                      className='cursor-pointer text-sm font-medium'
                    >
                      {t('createSubscriptionWithInvoice', {
                        defaultValue:
                          'Create subscription together with invoice'
                      })}
                    </Label>
                    <p className='text-muted-foreground text-xs'>
                      {t('createSubscriptionWithInvoiceHint', {
                        defaultValue:
                          'Creates one subscription row for this company and links the invoice in a single step.'
                      })}
                    </p>
                  </div>
                </div>
              )}

              {sub && (
                <div className='flex items-start space-x-2'>
                  <Checkbox
                    id='inv-link-sub'
                    checked={invLinkToSub}
                    onCheckedChange={(v) => setInvLinkToSub(v === true)}
                  />
                  <div className='grid gap-1 leading-none'>
                    <Label
                      htmlFor='inv-link-sub'
                      className='cursor-pointer text-sm font-medium'
                    >
                      {t('linkToExistingSubscription', {
                        defaultValue: 'Link invoice to current subscription'
                      })}
                    </Label>
                    <p className='text-muted-foreground text-xs'>
                      {t('linkToExistingSubscriptionHint', {
                        defaultValue:
                          'If unchecked, the invoice is created without a subscription link (you can attach it later via API).'
                      })}
                    </p>
                  </div>
                </div>
              )}

              {invCreateWithSub && !sub && (
                <div className='space-y-4 border-t pt-4'>
                  <div className='space-y-2'>
                    <Label>
                      {t('selectPlan', { defaultValue: 'Target plan' })}
                    </Label>
                    <Select value={invPlanId} onValueChange={setInvPlanId}>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('invoicePlanPlaceholder', {
                            defaultValue: 'Select plan…'
                          })}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptionPlans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='grid gap-2'>
                    <Label>
                      {t('subscriptionPeriodStart', {
                        defaultValue: 'Subscription period start (UTC)'
                      })}
                    </Label>
                    <DateTimePicker
                      value={invSubStart}
                      onChange={setInvSubStart}
                    />
                  </div>
                  <div className='grid gap-2'>
                    <Label>
                      {t('subscriptionPeriodEnd', {
                        defaultValue: 'Subscription period end (UTC)'
                      })}
                    </Label>
                    <DateTimePicker value={invSubEnd} onChange={setInvSubEnd} />
                  </div>
                </div>
              )}

              <Button
                disabled={createInv.isPending}
                onClick={() => createInv.mutate()}
              >
                {t('createInvoice', { defaultValue: 'Create invoice' })}
              </Button>
              {createInv.isError && (
                <p className='text-destructive text-sm'>
                  {(createInv.error as Error).message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <PlatformCompanyCounterpartySection
        key={`${company.id}-${company.updatedAt ?? ''}`}
        companyId={company.id}
        initialCounterparty={company.counterparty}
        canUseDadata={platFeatures?.dadata ?? false}
        canUseCleaner={platFeatures?.dadataCleaner ?? false}
        t={t}
      />

      {company.units && company.units.length > 0 && (
        <Card className='mt-6'>
          <CardHeader>
            <CardTitle>{t('units', { defaultValue: 'Units' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='list-inside list-disc text-sm'>
              {company.units.map((u) => (
                <li key={u.id}>
                  {u.name} ({u.code})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
