'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HandlersPlatformCreateSubscriptionPlanBody,
  ModelsSubscriptionPlan
} from '@/lib/api/generated/platform';
import {
  getListSubscriptionPlansQueryKey,
  listSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan
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
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';

const INVALID_PLAN_PRICE = 'INVALID_PLAN_PRICE';
const INVALID_PLAN_LIMITS = 'INVALID_PLAN_LIMITS';
const INVALID_PLAN_DISPLAY_ORDER = 'INVALID_PLAN_DISPLAY_ORDER';
const INVALID_ANNUAL_DISCOUNT = 'INVALID_ANNUAL_DISCOUNT';
const INVALID_ANNUAL_PPM = 'INVALID_ANNUAL_PPM';

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
  counters: 2,
  zones_per_unit: 2
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

type AnnualPrepayMode = 'none' | 'discount' | 'fixed';

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
  /** When true: plan is free (price locked to 0). */
  isFree: boolean;
  /** "flat" = fixed price, "per_unit" = price × active subdivisions. */
  pricingModel: 'flat' | 'per_unit';
  annualPrepayMode: AnnualPrepayMode;
  annualPrepayDiscountPercentStr: string;
  annualPrepayPricePerMonthStr: string;
  /** Raw input strings; validated to integers only on submit (see `parseLimitsFromForm`). */
  limits: Record<PlanLimitKey, string>;
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
    isFree: false,
    pricingModel: 'per_unit',
    annualPrepayMode: 'none',
    annualPrepayDiscountPercentStr: '',
    annualPrepayPricePerMonthStr: '',
    limits: Object.fromEntries(
      PLAN_LIMIT_KEYS.map((k) => [k, String(DEFAULT_LIMITS[k])])
    ) as Record<PlanLimitKey, string>,
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
  const limits = Object.fromEntries(
    PLAN_LIMIT_KEYS.map((k) => {
      const n = readLimit(limSrc, k, DEFAULT_LIMITS[k]);
      return [k, n === -1 ? '-1' : String(n)] as const;
    })
  ) as Record<PlanLimitKey, string>;
  const limitsNegotiable = defaultNegotiableMap();
  for (const k of PLAN_LIMIT_KEYS) {
    limitsNegotiable[k] = readNegotiable(negSrc, k);
  }
  const features = defaultFeatureMap();
  for (const k of PLAN_FEATURE_KEYS) {
    features[k] = readFeature(featSrc, k);
  }
  const disc = p.annualPrepayDiscountPercent;
  const ppm = p.annualPrepayPricePerMonth;
  let annualPrepayMode: AnnualPrepayMode = 'none';
  if (typeof disc === 'number' && disc >= 1 && disc <= 100) {
    annualPrepayMode = 'discount';
  } else if (typeof ppm === 'number' && ppm > 0) {
    annualPrepayMode = 'fixed';
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
    isFree: (p as { isFree?: boolean }).isFree === true,
    pricingModel: ((p as { pricingModel?: string }).pricingModel === 'flat'
      ? 'flat'
      : 'per_unit') as 'flat' | 'per_unit',
    annualPrepayMode,
    annualPrepayDiscountPercentStr:
      typeof disc === 'number' && disc >= 1 && disc <= 100 ? String(disc) : '',
    annualPrepayPricePerMonthStr:
      typeof ppm === 'number' && ppm > 0
        ? minorUnitsToAmountInputString(ppm, cur, locale)
        : '',
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

/**
 * Parse an integer only when the entire trimmed string is a valid integer
 * (rejects `parseInt`-style partial matches like `12abc` or `1.9`).
 */
function parseStrictIntString(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function parseDisplayOrder(raw: string): number | null {
  return parseStrictIntString(raw);
}

function parseLimitsFromForm(
  limits: Record<PlanLimitKey, string>
): Record<PlanLimitKey, number> | null {
  const out = {} as Record<PlanLimitKey, number>;
  for (const k of PLAN_LIMIT_KEYS) {
    const n = parseStrictIntString(limits[k]);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

function annualPrepayApiFieldsFromForm(
  form: PlanForm,
  intlLocale: string
): Pick<
  HandlersPlatformCreateSubscriptionPlanBody,
  'annualPrepayDiscountPercent' | 'annualPrepayPricePerMonth'
> {
  if (
    form.isFree ||
    form.interval !== 'month' ||
    form.annualPrepayMode === 'none'
  ) {
    return {};
  }
  if (form.annualPrepayMode === 'discount') {
    const n = parseStrictIntString(form.annualPrepayDiscountPercentStr);
    if (n === null || n < 1 || n > 100) {
      throw new Error(INVALID_ANNUAL_DISCOUNT);
    }
    return { annualPrepayDiscountPercent: n };
  }
  const cur = (form.currency || 'RUB').trim() || 'RUB';
  const m = parseAmountStringToMinorUnits(
    form.annualPrepayPricePerMonthStr.trim(),
    cur,
    intlLocale
  );
  if (!Number.isFinite(m) || m <= 0) {
    throw new Error(INVALID_ANNUAL_PPM);
  }
  return { annualPrepayPricePerMonth: Math.round(m) };
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
    queryKey: getListSubscriptionPlansQueryKey(),
    queryFn: async () => (await listSubscriptionPlans()).data
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
  const fieldId = useId();
  const fid = (suffix: string) => `${fieldId}-${suffix}`;

  const planFormInlineErrorMessage = (err: unknown): string | null => {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg === INVALID_PLAN_PRICE ||
      msg === INVALID_PLAN_LIMITS ||
      msg === INVALID_PLAN_DISPLAY_ORDER ||
      msg === INVALID_ANNUAL_DISCOUNT ||
      msg === INVALID_ANNUAL_PPM
    ) {
      return null;
    }
    return msg;
  };

  const parsePriceMinor = (): number | null => {
    const cur = (form.currency || 'RUB').trim() || 'RUB';
    const n = parseAmountStringToMinorUnits(form.price.trim(), cur, intlLocale);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  };

  const limitsPayload = (
    parsed: Record<PlanLimitKey, number>
  ): HandlersPlatformCreateSubscriptionPlanBody['limits'] =>
    Object.fromEntries(
      PLAN_LIMIT_KEYS.map((k) => [k, parsed[k]])
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
      const parsedLimits = parseLimitsFromForm(form.limits);
      if (parsedLimits === null || !validateLimits(parsedLimits)) {
        throw new Error(INVALID_PLAN_LIMITS);
      }
      const annual = annualPrepayApiFieldsFromForm(form, intlLocale);
      return createSubscriptionPlan({
        name: form.name.trim(),
        nameEn: form.nameEn.trim(),
        code: form.code.trim().toLowerCase(),
        price: form.isFree ? 0 : priceMinor,
        currency: form.currency || 'RUB',
        interval: form.interval,
        features: featuresPayload(),
        limits: limitsPayload(parsedLimits),
        limitsNegotiable: limitsNegotiablePayload(),
        isActive: form.isActive,
        isPublic: form.isPublic,
        isPromoted: form.isPromoted,
        displayOrder,
        allowInstantPurchase: form.isFree ? true : form.allowInstantPurchase,
        isFree: form.isFree,
        pricingModel: form.pricingModel,
        ...annual
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: getListSubscriptionPlansQueryKey()
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
      if (err.message === INVALID_ANNUAL_DISCOUNT) {
        toast.error(t('annualPrepayDiscountInvalid'));
        return;
      }
      if (err.message === INVALID_ANNUAL_PPM) {
        toast.error(t('annualPrepayFixedInvalid'));
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
      const parsedLimits = parseLimitsFromForm(form.limits);
      if (parsedLimits === null || !validateLimits(parsedLimits)) {
        throw new Error(INVALID_PLAN_LIMITS);
      }
      const annual = annualPrepayApiFieldsFromForm(form, intlLocale);
      return updateSubscriptionPlan(editPlan.id, {
        name: form.name.trim(),
        nameEn: form.nameEn.trim(),
        code: form.code.trim().toLowerCase(),
        price: form.isFree ? 0 : priceMinor,
        currency: form.currency || 'RUB',
        interval: form.interval,
        features: featuresPayload(),
        limits: limitsPayload(parsedLimits),
        limitsNegotiable: limitsNegotiablePayload(),
        isActive: form.isActive,
        isPublic: form.isPublic,
        isPromoted: form.isPromoted,
        displayOrder,
        allowInstantPurchase: form.isFree ? true : form.allowInstantPurchase,
        isFree: form.isFree,
        pricingModel: form.pricingModel,
        ...annual
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: getListSubscriptionPlansQueryKey()
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
      if (err.message === INVALID_ANNUAL_DISCOUNT) {
        toast.error(t('annualPrepayDiscountInvalid'));
        return;
      }
      if (err.message === INVALID_ANNUAL_PPM) {
        toast.error(t('annualPrepayFixedInvalid'));
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
        <Label htmlFor={fid('name')}>
          {t('name', { defaultValue: 'Name' })}
        </Label>
        <Input
          id={fid('name')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={fid('nameEn')}>{t('nameEn')}</Label>
        <Input
          id={fid('nameEn')}
          value={form.nameEn}
          onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
          autoComplete='off'
        />
        <p className='text-muted-foreground text-xs'>{t('nameEnHint')}</p>
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={fid('code')}>
          {t('code', { defaultValue: 'Code' })}
        </Label>
        <Input
          id={fid('code')}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={fid('price')}>
          {t('price', { defaultValue: 'Price' })}
        </Label>
        <Input
          id={fid('price')}
          type='text'
          inputMode='decimal'
          autoComplete='off'
          value={form.isFree ? '0' : form.price}
          disabled={form.isFree}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          placeholder={locale.startsWith('ru') ? '2900,50' : '2900.50'}
        />
        <p className='text-muted-foreground text-xs'>{t('priceHint')}</p>
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={fid('currency')}>
          {t('currency', { defaultValue: 'Currency' })}
        </Label>
        <Input
          id={fid('currency')}
          value={form.currency}
          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
        />
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={fid('interval')}>
          {t('interval', { defaultValue: 'Interval' })}
        </Label>
        <select
          id={fid('interval')}
          className='border-input bg-background h-9 w-full rounded-md border px-2 text-sm'
          value={form.interval}
          onChange={(e) => {
            const interval = e.target.value as 'month' | 'year';
            setForm((f) => ({
              ...f,
              interval,
              ...(interval === 'year'
                ? {
                    annualPrepayMode: 'none' as const,
                    annualPrepayDiscountPercentStr: '',
                    annualPrepayPricePerMonthStr: ''
                  }
                : {})
            }));
          }}
        >
          <option value='month'>{t('intervalMonth')}</option>
          <option value='year'>{t('intervalYear')}</option>
        </select>
      </div>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            id={fid('isActive')}
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
          />
          <Label htmlFor={fid('isActive')}>
            {t('active', { defaultValue: 'Active' })}
          </Label>
        </div>
      </div>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            id={fid('isPublic')}
            checked={form.isPublic}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
          />
          <Label htmlFor={fid('isPublic')}>{t('public')}</Label>
        </div>
        <p className='text-muted-foreground text-xs'>{t('publicHint')}</p>
      </div>

      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            id={fid('isPromoted')}
            checked={form.isPromoted}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isPromoted: v }))}
          />
          <Label htmlFor={fid('isPromoted')}>{t('promoted')}</Label>
        </div>
        <p className='text-muted-foreground text-xs'>{t('promotedHint')}</p>
      </div>

      <div className='grid gap-2'>
        <Label htmlFor={fid('displayOrder')}>{t('displayOrder')}</Label>
        <Input
          id={fid('displayOrder')}
          type='text'
          inputMode='numeric'
          autoComplete='off'
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
            id={fid('allowInstantPurchase')}
            checked={form.isFree || form.allowInstantPurchase}
            disabled={form.isFree}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, allowInstantPurchase: v }))
            }
          />
          <Label htmlFor={fid('allowInstantPurchase')}>
            {t('allowInstantPurchase')}
          </Label>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('allowInstantPurchaseHint')}
        </p>
      </div>

      <div className='flex flex-col gap-1'>
        <div className='flex items-center gap-2'>
          <Switch
            id={fid('isFree')}
            checked={form.isFree}
            onCheckedChange={(v) =>
              setForm((f) => ({
                ...f,
                isFree: v,
                price: v ? '0' : f.price,
                allowInstantPurchase: v ? true : f.allowInstantPurchase,
                ...(v
                  ? {
                      annualPrepayMode: 'none' as const,
                      annualPrepayDiscountPercentStr: '',
                      annualPrepayPricePerMonthStr: ''
                    }
                  : {})
              }))
            }
          />
          <Label htmlFor={fid('isFree')}>
            {t('isFree', { defaultValue: 'Бесплатный тариф' })}
          </Label>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('isFreeHint', {
            defaultValue:
              'Цена всегда 0, тариф отображается как «Бесплатно» (не «Индивидуальная цена»)'
          })}
        </p>
      </div>

      <div className='grid gap-2'>
        <Label htmlFor={fid('pricingModel')}>
          {t('pricingModel', { defaultValue: 'Модель ценообразования' })}
        </Label>
        <select
          id={fid('pricingModel')}
          className='border-input bg-background h-9 w-full rounded-md border px-2 text-sm'
          value={form.pricingModel}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              pricingModel: e.target.value as 'flat' | 'per_unit'
            }))
          }
        >
          <option value='per_unit'>
            {t('pricingModelPerUnit', { defaultValue: 'За подразделение' })}
          </option>
          <option value='flat'>
            {t('pricingModelFlat', { defaultValue: 'Фиксированная' })}
          </option>
        </select>
        <p className='text-muted-foreground text-xs'>
          {t('pricingModelHint', {
            defaultValue:
              'За подразделение: итог = цена × кол-во активных подразделений'
          })}
        </p>
      </div>

      {!form.isFree && form.interval === 'month' ? (
        <div className='border-border bg-muted/30 grid gap-3 rounded-lg border p-4'>
          <div>
            <h3 className='text-sm font-semibold'>
              {t('annualPrepaySection')}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('annualPrepayHint')}
            </p>
          </div>
          <div
            className='flex flex-wrap gap-2'
            role='radiogroup'
            aria-label={t('annualPrepaySection')}
          >
            {(
              [
                ['none', t('annualPrepayNone')],
                ['discount', t('annualPrepayDiscount')],
                ['fixed', t('annualPrepayFixed')]
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type='button'
                role='radio'
                aria-checked={form.annualPrepayMode === mode}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                  form.annualPrepayMode === mode
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted/50'
                }`}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    annualPrepayMode: mode,
                    ...(mode !== 'discount'
                      ? { annualPrepayDiscountPercentStr: '' }
                      : {}),
                    ...(mode !== 'fixed'
                      ? { annualPrepayPricePerMonthStr: '' }
                      : {})
                  }))
                }
              >
                {label}
              </button>
            ))}
          </div>
          {form.annualPrepayMode === 'discount' ? (
            <div className='grid gap-2'>
              <Label htmlFor={fid('annual-discount')}>
                {t('annualPrepayDiscountLabel')}
              </Label>
              <Input
                id={fid('annual-discount')}
                type='text'
                inputMode='numeric'
                autoComplete='off'
                value={form.annualPrepayDiscountPercentStr}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    annualPrepayDiscountPercentStr: e.target.value
                  }))
                }
                placeholder='10'
              />
            </div>
          ) : null}
          {form.annualPrepayMode === 'fixed' ? (
            <div className='grid gap-2'>
              <Label htmlFor={fid('annual-ppm')}>
                {t('annualPrepayFixedLabel')}
              </Label>
              <Input
                id={fid('annual-ppm')}
                type='text'
                inputMode='decimal'
                autoComplete='off'
                value={form.annualPrepayPricePerMonthStr}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    annualPrepayPricePerMonthStr: e.target.value
                  }))
                }
                placeholder={locale.startsWith('ru') ? '2400,00' : '2400.00'}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className='border-border mt-2 border-t pt-4'>
        <h3 className='mb-3 text-sm font-semibold'>{t('limitsSection')}</h3>
        <div className='grid gap-4'>
          {PLAN_LIMIT_KEYS.map((key) => {
            const unlimited = form.limits[key] === '-1';
            const negotiable = form.limitsNegotiable[key];
            return (
              <div key={key} className='grid gap-2 sm:grid-cols-2 sm:items-end'>
                <div className='flex flex-col gap-2'>
                  <Label id={fid(`limit-heading-${key}`)}>
                    {tLim(key as never)}
                  </Label>
                  <div
                    className='flex flex-wrap items-center gap-x-4 gap-y-2'
                    role='group'
                    aria-labelledby={fid(`limit-heading-${key}`)}
                  >
                    <div className='flex items-center gap-2'>
                      <Switch
                        id={fid(`limit-unlimited-${key}`)}
                        checked={unlimited}
                        disabled={negotiable}
                        onCheckedChange={(c) =>
                          setForm((f) => ({
                            ...f,
                            limits: {
                              ...f.limits,
                              [key]: c ? '-1' : String(DEFAULT_LIMITS[key])
                            },
                            limitsNegotiable: {
                              ...f.limitsNegotiable,
                              [key]: c ? false : f.limitsNegotiable[key]
                            }
                          }))
                        }
                      />
                      <Label
                        htmlFor={fid(`limit-unlimited-${key}`)}
                        className='text-muted-foreground text-sm font-normal'
                      >
                        {tLim('unlimited')}
                      </Label>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Switch
                        id={fid(`limit-negotiable-${key}`)}
                        checked={negotiable}
                        disabled={unlimited}
                        onCheckedChange={(c) =>
                          setForm((f) => {
                            let nextLimits = f.limits[key];
                            if (c && nextLimits === '-1') {
                              nextLimits = String(DEFAULT_LIMITS[key]);
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
                      <Label
                        htmlFor={fid(`limit-negotiable-${key}`)}
                        className='text-muted-foreground text-sm font-normal'
                      >
                        {t('limitNegotiable')}
                      </Label>
                    </div>
                  </div>
                </div>
                <div className='grid gap-1'>
                  <Label
                    htmlFor={fid(`limit-value-${key}`)}
                    className='text-muted-foreground sr-only sm:not-sr-only'
                  >
                    {t('limitValue')}
                  </Label>
                  <Input
                    id={fid(`limit-value-${key}`)}
                    type='text'
                    inputMode='numeric'
                    autoComplete='off'
                    disabled={unlimited || negotiable}
                    value={unlimited || negotiable ? '' : form.limits[key]}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        limits: { ...f.limits, [key]: e.target.value }
                      }))
                    }
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
                <Label
                  htmlFor={fid(`feature-${key}`)}
                  className='block text-sm leading-snug font-normal'
                >
                  {tFeat(key as never)}
                </Label>
                {!BACKEND_ENFORCED_PLAN_FEATURES.has(key) ? (
                  <p className='text-muted-foreground mt-0.5 text-xs leading-snug'>
                    {t('featureNoBackendNote')}
                  </p>
                ) : null}
              </div>
              <Switch
                id={fid(`feature-${key}`)}
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
            {(() => {
              const inline = createMut.isError
                ? planFormInlineErrorMessage(createMut.error)
                : null;
              return inline ? (
                <p className='text-destructive text-sm'>{inline}</p>
              ) : null;
            })()}
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
          {(() => {
            const inline = updateMut.isError
              ? planFormInlineErrorMessage(updateMut.error)
              : null;
            return inline ? (
              <p className='text-destructive text-sm'>{inline}</p>
            ) : null;
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
