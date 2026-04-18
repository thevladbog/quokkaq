'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HandlersPlatformCreateSubscriptionPlanBody,
  HandlersPlatformUpdateSubscriptionPlanBody,
  ModelsSubscriptionPlan
} from '@/lib/api/generated/platform';
import {
  getGetPlatformSubscriptionPlansQueryKey,
  getPlatformSubscriptionPlans,
  postPlatformSubscriptionPlans,
  putPlatformSubscriptionPlansId
} from '@/lib/api/generated/platform';
import {
  PLAN_FEATURE_KEYS,
  PLAN_LIMIT_KEYS,
  type PlanLimitKey
} from '@quokkaq/subscription-pricing';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const INVALID_PLAN_PRICE = 'INVALID_PLAN_PRICE';
const INVALID_PLAN_LIMITS = 'INVALID_PLAN_LIMITS';
const INVALID_PLAN_DISPLAY_ORDER = 'INVALID_PLAN_DISPLAY_ORDER';

/** Plan feature keys that the Go backend actually reads for access control. */
const BACKEND_ENFORCED_PLAN_FEATURES = new Set<string>([
  'counter_guest_survey',
  'basic_reports',
  'advanced_reports'
]);
import {
  formatPriceMinorUnits,
  minorUnitsToAmountInputString,
  parseAmountStringToMinorUnits
} from '@/lib/format-price';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';

const DEFAULT_LIMITS: Record<PlanLimitKey, number> = {
  units: 1,
  users: 3,
  tickets_per_month: 100,
  services: 5,
  counters: 2
};

function defaultFeatureMap(): Record<
  (typeof PLAN_FEATURE_KEYS)[number],
  boolean
> {
  return Object.fromEntries(PLAN_FEATURE_KEYS.map((k) => [k, false])) as Record<
    (typeof PLAN_FEATURE_KEYS)[number],
    boolean
  >;
}

type PlanForm = {
  name: string;
  nameEn: string;
  code: string;
  price: string;
  currency: string;
  interval: 'month' | 'year';
  isActive: boolean;
  isPublic: boolean;
  /** Single highlighted tier on marketing / in-app pricing. */
  isPromoted: boolean;
  displayOrder: string;
  allowInstantPurchase: boolean;
  limits: Record<PlanLimitKey, number>;
  limitsNegotiable: Record<PlanLimitKey, boolean>;
  features: Record<(typeof PLAN_FEATURE_KEYS)[number], boolean>;
};

function emptyForm(): PlanForm {
  return {
    name: '',
    nameEn: '',
    code: '',
    price: '',
    currency: 'RUB',
    interval: 'month',
    isActive: true,
    isPublic: false,
    isPromoted: false,
    displayOrder: '1000',
    allowInstantPurchase: true,
    limits: { ...DEFAULT_LIMITS },
    limitsNegotiable: defaultNegotiableMap(),
    features: defaultFeatureMap()
  };
}

function readLimit(
  src: Record<string, unknown> | undefined,
  key: PlanLimitKey,
  fallback: number
): number {
  const v = src?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  return fallback;
}

function readFeature(
  src: Record<string, unknown> | undefined,
  key: (typeof PLAN_FEATURE_KEYS)[number]
): boolean {
  return Boolean(src?.[key]);
}

function defaultNegotiableMap(): Record<PlanLimitKey, boolean> {
  return Object.fromEntries(PLAN_LIMIT_KEYS.map((k) => [k, false])) as Record<
    PlanLimitKey,
    boolean
  >;
}

function readNegotiable(
  src: Record<string, unknown> | undefined,
  key: PlanLimitKey
): boolean {
  return Boolean(src?.[key]);
}

function formFromPlan(p: ModelsSubscriptionPlan, locale: string): PlanForm {
  const cur = p.currency ?? 'RUB';
  const limSrc = p.limits as Record<string, unknown> | undefined;
  const featSrc = p.features as Record<string, unknown> | undefined;
  const negSrc = p.limitsNegotiable as Record<string, unknown> | undefined;
  const limits = { ...DEFAULT_LIMITS };
  for (const k of PLAN_LIMIT_KEYS) {
    limits[k] = readLimit(limSrc, k, DEFAULT_LIMITS[k]);
  }
  const limitsNegotiable = defaultNegotiableMap();
  for (const k of PLAN_LIMIT_KEYS) {
    limitsNegotiable[k] = readNegotiable(negSrc, k);
  }
  const features = defaultFeatureMap();
  for (const k of PLAN_FEATURE_KEYS) {
    features[k] = readFeature(featSrc, k);
  }
  return {
    name: p.name ?? '',
    nameEn: p.nameEn ?? '',
    code: p.code ?? '',
    price: minorUnitsToAmountInputString(p.price ?? 0, cur, locale),
    currency: cur,
    interval: (p.interval === 'year' ? 'year' : 'month') as 'month' | 'year',
    isActive: p.isActive !== false,
    isPublic: p.isPublic !== false,
    isPromoted: p.isPromoted === true,
    displayOrder: String(p.displayOrder ?? 1000),
    allowInstantPurchase: p.allowInstantPurchase !== false,
    limits,
    limitsNegotiable,
    features
  };
}

function validateLimits(limits: Record<PlanLimitKey, number>): boolean {
  for (const k of PLAN_LIMIT_KEYS) {
    const v = limits[k];
    if (v === -1) continue;
    if (!Number.isInteger(v) || v < 0) return false;
  }
  return true;
}

function parseDisplayOrder(raw: string): number | null {
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

type PlanRow = ModelsSubscriptionPlan & { id: string };

export default function PlatformPlansPage() {
  const t = useTranslations('platform.plans');
  const tLim = useTranslations('organization.billing.planSelector.limits');
  const tFeat = useTranslations('organization.billing.planSelector.features');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: getGetPlatformSubscriptionPlansQueryKey(),
    queryFn: async () => (await getPlatformSubscriptionPlans()).data
  });

  const sortedPlans = useMemo(() => {
    if (!plans?.length) return null;
    return [...plans].sort((a, b) => {
      const da = a.displayOrder ?? 1000;
      const db = b.displayOrder ?? 1000;
      if (da !== db) return da - db;
      return (a.name ?? '').localeCompare(b.name ?? '', locale);
    });
  }, [plans, locale]);

  const [openCreate, setOpenCreate] = useState(false);
  const [editPlan, setEditPlan] = useState<PlanRow | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm());

  const parsePriceMinor = (): number | null => {
    const cur = (form.currency || 'RUB').trim() || 'RUB';
    const n = parseAmountStringToMinorUnits(form.price.trim(), cur, intlLocale);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  };

  const limitsPayload = () =>
    Object.fromEntries(
      PLAN_LIMIT_KEYS.map((k) => [k, form.limits[k]])
    ) as HandlersPlatformCreateSubscriptionPlanBody['limits'];

  const featuresPayload = () =>
    Object.fromEntries(
      PLAN_FEATURE_KEYS.map((k) => [k, form.features[k]])
    ) as HandlersPlatformCreateSubscriptionPlanBody['features'];

  const limitsNegotiablePayload = () =>
    Object.fromEntries(
      PLAN_LIMIT_KEYS.map((k) => [k, form.limitsNegotiable[k]])
    ) as HandlersPlatformCreateSubscriptionPlanBody['limitsNegotiable'];

  const createMut = useMutation({
    mutationFn: () => {
      const priceMinor = parsePriceMinor();
      if (priceMinor === null) {
        throw new Error(INVALID_PLAN_PRICE);
      }
      const displayOrder = parseDisplayOrder(form.displayOrder);
      if (displayOrder === null) {
        throw new Error(INVALID_PLAN_DISPLAY_ORDER);
      }
      if (!validateLimits(form.limits)) {
        throw new Error(INVALID_PLAN_LIMITS);
      }
      return postPlatformSubscriptionPlans({
        name: form.name.trim(),
        nameEn: form.nameEn.trim(),
        code: form.code.trim().toLowerCase(),
        price: priceMinor,
        currency: form.currency || 'RUB',
        interval: form.interval,
        features: featuresPayload(),
        limits: limitsPayload(),
        limitsNegotiable: limitsNegotiablePayload(),
        isActive: form.isActive,
        isPublic: form.isPublic,
        isPromoted: form.isPromoted,
        displayOrder,
        allowInstantPurchase: form.allowInstantPurchase
      } satisfies HandlersPlatformCreateSubscriptionPlanBody);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: getGetPlatformSubscriptionPlansQueryKey()
      });
      setOpenCreate(false);
      setForm(emptyForm());
      toast.success(t('toastCreated'));
    },
    onError: (err: Error) => {
      if (err.message === INVALID_PLAN_PRICE) {
        toast.error(t('priceInvalid'));
        return;
      }
      if (err.message === INVALID_PLAN_LIMITS) {
        toast.error(t('limitsInvalid'));
        return;
      }
      if (err.message === INVALID_PLAN_DISPLAY_ORDER) {
        toast.error(t('displayOrderInvalid'));
        return;
      }
      toast.error(t('toastError', { message: err.message }));
    }
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editPlan) throw new Error('no plan');
      const priceMinor = parsePriceMinor();
      if (priceMinor === null) {
        throw new Error(INVALID_PLAN_PRICE);
      }
      const displayOrder = parseDisplayOrder(form.displayOrder);
      if (displayOrder === null) {
        throw new Error(INVALID_PLAN_DISPLAY_ORDER);
      }
      if (!validateLimits(form.limits)) {
        throw new Error(INVALID_PLAN_LIMITS);
      }
      return putPlatformSubscriptionPlansId(editPlan.id, {
        name: form.name.trim(),
        nameEn: form.nameEn.trim(),
        code: form.code.trim().toLowerCase(),
        price: priceMinor,
        currency: form.currency || 'RUB',
        interval: form.interval,
        features: featuresPayload(),
        limits: limitsPayload(),
        limitsNegotiable: limitsNegotiablePayload(),
        isActive: form.isActive,
        isPublic: form.isPublic,
        isPromoted: form.isPromoted,
        displayOrder,
        allowInstantPurchase: form.allowInstantPurchase
      } satisfies HandlersPlatformUpdateSubscriptionPlanBody);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: getGetPlatformSubscriptionPlansQueryKey()
      });
      setEditPlan(null);
      setForm(emptyForm());
      toast.success(t('toastUpdated'));
    },
    onError: (err: Error) => {
      if (err.message === INVALID_PLAN_PRICE) {
        toast.error(t('priceInvalid'));
        return;
      }
      if (err.message === INVALID_PLAN_LIMITS) {
        toast.error(t('limitsInvalid'));
        return;
      }
      if (err.message === INVALID_PLAN_DISPLAY_ORDER) {
        toast.error(t('displayOrderInvalid'));
        return;
      }
      toast.error(t('toastError', { message: err.message }));
    }
  });

  const openEdit = (p: PlanRow) => {
    setEditPlan(p);
    setForm(formFromPlan(p, locale));
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
        <Label>{t('nameEn')}</Label>
        <Input
          value={form.nameEn}
          onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
          autoComplete='off'
        />
        <p className='text-muted-foreground text-xs'>{t('nameEnHint')}</p>
      </div>
      <div className='grid gap-2'>
        <Label>{t('code', { defaultValue: 'Code' })}</Label>
        <Input
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label>{t('price', { defaultValue: 'Price' })}</Label>
        <Input
          type='text'
          inputMode='decimal'
          autoComplete='off'
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          placeholder={locale.startsWith('ru') ? '2900,50' : '2900.50'}
        />
        <p className='text-muted-foreground text-xs'>{t('priceHint')}</p>
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
          <option value='month'>{t('intervalMonth')}</option>
          <option value='year'>{t('intervalYear')}</option>
        </select>
      </div>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />
          <Label>{t('active', { defaultValue: 'Active' })}</Label>
        </div>
      </div>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.isPublic}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
          />
          <Label>{t('public')}</Label>
        </div>
        <p className='text-muted-foreground text-xs'>{t('publicHint')}</p>
      </div>

      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.isPromoted}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isPromoted: v }))}
          />
          <Label>{t('promoted')}</Label>
        </div>
        <p className='text-muted-foreground text-xs'>{t('promotedHint')}</p>
      </div>

      <div className='grid gap-2'>
        <Label>{t('displayOrder')}</Label>
        <Input
          type='number'
          step={1}
          value={form.displayOrder}
          onChange={(e) =>
            setForm((f) => ({ ...f, displayOrder: e.target.value }))
          }
        />
        <p className='text-muted-foreground text-xs'>{t('displayOrderHint')}</p>
      </div>

      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            checked={form.allowInstantPurchase}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, allowInstantPurchase: v }))
            }
          />
          <Label>{t('allowInstantPurchase')}</Label>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('allowInstantPurchaseHint')}
        </p>
      </div>

      <div className='border-border mt-2 border-t pt-4'>
        <h3 className='mb-3 text-sm font-semibold'>{t('limitsSection')}</h3>
        <div className='grid gap-4'>
          {PLAN_LIMIT_KEYS.map((key) => {
            const unlimited = form.limits[key] === -1;
            const negotiable = form.limitsNegotiable[key];
            return (
              <div key={key} className='grid gap-2 sm:grid-cols-2 sm:items-end'>
                <div className='flex flex-col gap-2'>
                  <Label>{tLim(key as never)}</Label>
                  <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                    <div className='flex items-center gap-2'>
                      <Switch
                        checked={unlimited}
                        disabled={negotiable}
                        onCheckedChange={(c) =>
                          setForm((f) => ({
                            ...f,
                            limits: {
                              ...f.limits,
                              [key]: c ? -1 : DEFAULT_LIMITS[key]
                            },
                            limitsNegotiable: {
                              ...f.limitsNegotiable,
                              [key]: c ? false : f.limitsNegotiable[key]
                            }
                          }))
                        }
                      />
                      <span className='text-muted-foreground text-sm'>
                        {tLim('unlimited')}
                      </span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Switch
                        checked={negotiable}
                        disabled={unlimited}
                        onCheckedChange={(c) =>
                          setForm((f) => {
                            let nextLimits = f.limits[key];
                            if (c && nextLimits === -1) {
                              nextLimits = DEFAULT_LIMITS[key];
                            }
                            return {
                              ...f,
                              limits: { ...f.limits, [key]: nextLimits },
                              limitsNegotiable: {
                                ...f.limitsNegotiable,
                                [key]: c
                              }
                            };
                          })
                        }
                      />
                      <span className='text-muted-foreground text-sm'>
                        {t('limitNegotiable')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className='grid gap-1'>
                  <Label className='text-muted-foreground sr-only sm:not-sr-only'>
                    {t('limitValue')}
                  </Label>
                  <Input
                    type='number'
                    min={0}
                    step={1}
                    disabled={unlimited || negotiable}
                    value={
                      unlimited || negotiable ? '' : String(form.limits[key])
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = parseInt(raw, 10);
                      setForm((f) => ({
                        ...f,
                        limits: {
                          ...f.limits,
                          [key]: Number.isFinite(n) ? n : 0
                        }
                      }));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className='border-border mt-2 border-t pt-4'>
        <h3 className='mb-3 text-sm font-semibold'>{t('featuresSection')}</h3>
        <div className='grid gap-3'>
          {PLAN_FEATURE_KEYS.map((key) => (
            <div key={key} className='flex items-start justify-between gap-4'>
              <div className='min-w-0 flex-1'>
                <Label className='block text-sm leading-snug font-normal'>
                  {tFeat(key as never)}
                </Label>
                {!BACKEND_ENFORCED_PLAN_FEATURES.has(key) ? (
                  <p className='text-muted-foreground mt-0.5 text-xs leading-snug'>
                    {t('featureNoBackendNote')}
                  </p>
                ) : null}
              </div>
              <Switch
                className='mt-0.5 shrink-0'
                checked={form.features[key]}
                onCheckedChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    features: { ...f.features, [key]: v }
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const dialogScroll = (
    <ScrollArea className='max-h-[min(65vh,560px)] pr-3'>
      <div className='grid gap-4 py-2 pr-1'>{FormFields}</div>
    </ScrollArea>
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
          <DialogContent className='max-h-[90vh] sm:max-w-xl'>
            <DialogHeader>
              <DialogTitle>
                {t('createTitle', { defaultValue: 'Create plan' })}
              </DialogTitle>
            </DialogHeader>
            {dialogScroll}
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

      {sortedPlans && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('name', { defaultValue: 'Name' })}</TableHead>
              <TableHead>{t('nameEnColumn')}</TableHead>
              <TableHead>{t('code', { defaultValue: 'Code' })}</TableHead>
              <TableHead>
                {t('priceColumn', { defaultValue: 'Price' })}
              </TableHead>
              <TableHead>
                {t('interval', { defaultValue: 'Interval' })}
              </TableHead>
              <TableHead>{t('active', { defaultValue: 'Active' })}</TableHead>
              <TableHead>{t('publicColumn')}</TableHead>
              <TableHead className='text-center'>
                {t('promotedColumn')}
              </TableHead>
              <TableHead className='text-right'>
                {t('displayOrderColumn')}
              </TableHead>
              <TableHead className='text-center'>
                {t('checkoutColumn')}
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPlans
              .filter((p): p is PlanRow => Boolean(p.id?.trim()))
              .map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className='max-w-[10rem] truncate text-sm'>
                    {p.nameEn?.trim() ? p.nameEn : '—'}
                  </TableCell>
                  <TableCell className='font-mono text-sm'>{p.code}</TableCell>
                  <TableCell className='font-medium'>
                    {formatPriceMinorUnits(
                      p.price ?? 0,
                      p.currency ?? 'RUB',
                      intlLocale
                    )}
                  </TableCell>
                  <TableCell>{p.interval}</TableCell>
                  <TableCell>{p.isActive ? '✓' : '—'}</TableCell>
                  <TableCell>{p.isPublic !== false ? '✓' : '—'}</TableCell>
                  <TableCell className='text-center'>
                    {p.isPromoted === true ? '✓' : '—'}
                  </TableCell>
                  <TableCell className='text-right font-mono text-sm'>
                    {p.displayOrder ?? 1000}
                  </TableCell>
                  <TableCell className='text-center'>
                    {p.allowInstantPurchase !== false ? '✓' : '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => openEdit(p)}
                    >
                      {t('edit', { defaultValue: 'Edit' })}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editPlan} onOpenChange={(o) => !o && setEditPlan(null)}>
        <DialogContent className='max-h-[90vh] sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>
              {t('editTitle', { defaultValue: 'Edit plan' })}
            </DialogTitle>
          </DialogHeader>
          {dialogScroll}
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
