'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invoice } from '@quokkaq/shared-types';
import type {
  HandlersInvoiceDraftCreateBody,
  HandlersInvoiceDraftUpsertBody,
  HandlersPlatformListResponseModelsCatalogItem,
  ModelsCatalogItem,
  ModelsInvoice,
  ModelsSubscriptionPlan
} from '@/lib/api/generated/platform';
import {
  getGetPlatformCatalogItemsQueryKey,
  getGetCompanyQueryKey,
  getPlatformGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getListSubscriptionPlansQueryKey,
  getPlatformCatalogItems,
  getCompany,
  platformGetInvoice,
  listSubscriptionPlans,
  getListCompaniesQueryKey,
  platformPatchInvoiceDraft,
  listCompanies,
  platformCreateInvoice,
  platformIssueInvoice
} from '@/lib/api/generated/platform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import { useRouter } from '@/src/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  intlLocaleFromAppLocale,
  toDateTimeLocalString
} from '@/lib/format-datetime';
import {
  formatPriceMinorUnits,
  minorUnitsToAmountInputString
} from '@/lib/format-price';
import {
  computeLineTotals,
  discountMinorForLineInput
} from '@/lib/invoice-line-totals';
import {
  buildDraftBody,
  invoiceToDraftUpsertBody,
  newDraftLineRow,
  rowsFromInvoiceLines,
  tryParseDraftRowForTotals,
  type DraftLineRow
} from '@/lib/platform-invoice-draft-body';

export type { DraftLineRow } from '@/lib/platform-invoice-draft-body';

type PlatformInvoiceDraftFormProps = {
  /** Prefill company when creating from company page */
  defaultCompanyId?: string;
  /** Editing an existing draft (loaded with lines) */
  initialInvoice?: Invoice | null;
};

export function PlatformInvoiceDraftForm({
  defaultCompanyId = '',
  initialInvoice = null
}: PlatformInvoiceDraftFormProps) {
  const t = useTranslations('platform.invoiceDraft');
  const appLocale = useLocale();
  const intlLocale = useMemo(
    () => intlLocaleFromAppLocale(appLocale),
    [appLocale]
  );
  const qc = useQueryClient();
  const router = useRouter();
  const isEdit = !!initialInvoice?.id;

  const [companyId, setCompanyId] = useState(
    initialInvoice?.companyId?.trim() || defaultCompanyId.trim()
  );
  const [dueLocal, setDueLocal] = useState(() =>
    initialInvoice?.dueDate ? toDateTimeLocalString(initialInvoice.dueDate) : ''
  );
  const [currency, setCurrency] = useState(
    initialInvoice?.currency?.trim() || 'RUB'
  );
  const [allowYookassa, setAllowYookassa] = useState(
    initialInvoice?.allowYookassaPaymentLink ?? false
  );
  const [allowStripe, setAllowStripe] = useState(
    initialInvoice?.allowStripePaymentLink ?? false
  );
  const [provision, setProvision] = useState(
    initialInvoice?.provisionSubscriptionsOnPayment ?? false
  );
  const [rows, setRows] = useState<DraftLineRow[]>(() =>
    rowsFromInvoiceLines(
      initialInvoice?.lines,
      initialInvoice?.currency?.trim() || 'RUB',
      appLocale
    )
  );

  /** Avoid re-seeding when `initialInvoice` is a new object reference but the same draft (preserves in-progress edits). */
  const syncedInvoiceIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const inv = initialInvoice;
    const id = inv?.id?.trim() ?? '';

    if (id) {
      if (syncedInvoiceIdRef.current === id) {
        return;
      }
      syncedInvoiceIdRef.current = id;
      const snapshot = inv!;
      queueMicrotask(() => {
        setCompanyId(snapshot.companyId?.trim() ?? '');
        setDueLocal(
          snapshot.dueDate ? toDateTimeLocalString(snapshot.dueDate) : ''
        );
        setCurrency(snapshot.currency?.trim() || 'RUB');
        setAllowYookassa(snapshot.allowYookassaPaymentLink ?? false);
        setAllowStripe(snapshot.allowStripePaymentLink ?? false);
        setProvision(snapshot.provisionSubscriptionsOnPayment ?? false);
        setRows(
          rowsFromInvoiceLines(
            snapshot.lines,
            snapshot.currency?.trim() || 'RUB',
            appLocale
          )
        );
      });
      return;
    }

    if (syncedInvoiceIdRef.current !== undefined) {
      syncedInvoiceIdRef.current = undefined;
      const d = defaultCompanyId.trim();
      queueMicrotask(() => {
        setCompanyId(d);
        setDueLocal('');
        setCurrency('RUB');
        setAllowYookassa(false);
        setAllowStripe(false);
        setProvision(false);
        setRows(rowsFromInvoiceLines(undefined, 'RUB', appLocale));
      });
    }
  }, [initialInvoice, appLocale, defaultCompanyId]);

  useEffect(() => {
    if (initialInvoice?.id) return;
    const d = defaultCompanyId.trim();
    if (d) queueMicrotask(() => setCompanyId(d));
  }, [defaultCompanyId, initialInvoice?.id]);

  const {
    data: companiesData,
    isError: companiesQueryError,
    error: companiesErrorObj
  } = useQuery({
    queryKey: getListCompaniesQueryKey({ limit: 200 }),
    queryFn: async () => (await listCompanies({ limit: 200 })).data,
    enabled: !isEdit
  });

  const companyOptions = useMemo(() => {
    return (companiesData?.items ?? [])
      .filter((c): c is typeof c & { id: string } => Boolean(c.id?.trim()))
      .map((c) => ({
        value: c.id,
        label: `${c.name} (${c.id.slice(0, 8)}…)`,
        keywords: [c.name ?? '', c.id]
      }));
  }, [companiesData?.items]);

  const {
    data: companyForEdit,
    isPending: companyForEditLoading,
    isError: companyForEditQueryError,
    error: companyForEditErrorObj
  } = useQuery({
    queryKey: getGetCompanyQueryKey(companyId),
    queryFn: async () => (await getCompany(companyId)).data,
    enabled: isEdit && !!companyId.trim()
  });

  const {
    data: catalogData,
    isError: catalogQueryError,
    error: catalogErrorObj
  } = useQuery({
    queryKey: getGetPlatformCatalogItemsQueryKey({ limit: 500 }),
    queryFn: async () =>
      (await getPlatformCatalogItems({ limit: 500 }))
        .data as HandlersPlatformListResponseModelsCatalogItem
  });

  const catalogItems = useMemo(
    () =>
      (catalogData?.items ?? []).filter(
        (c): c is ModelsCatalogItem & { id: string } =>
          c.isActive !== false && Boolean(c.id?.trim())
      ),
    [catalogData?.items]
  );

  const {
    data: plans = [],
    isError: plansQueryError,
    error: plansErrorObj
  } = useQuery({
    queryKey: getListSubscriptionPlansQueryKey(),
    queryFn: async () =>
      (await listSubscriptionPlans()).data as ModelsSubscriptionPlan[]
  });

  const referenceDataBlocked =
    (!isEdit && companiesQueryError) ||
    (isEdit && !!companyId.trim() && companyForEditQueryError) ||
    catalogQueryError ||
    plansQueryError;

  const catalogById = useMemo(() => {
    const m = new Map<string, (typeof catalogItems)[number]>();
    for (const c of catalogItems) {
      m.set(c.id, c);
    }
    return m;
  }, [catalogItems]);

  const applyCatalogToRow = useCallback(
    (key: string, catalogId: string) => {
      const draftCur = currency.trim() || 'RUB';
      const item = catalogById.get(catalogId);
      setRows((prev) =>
        prev.map((r) => {
          if (r.key !== key) return r;
          if (!item) {
            return { ...r, catalogItemId: catalogId };
          }
          const itemCur = item.currency?.trim() || 'RUB';
          const sameCurrency = itemCur === draftCur;
          return {
            ...r,
            catalogItemId: catalogId,
            descriptionPrint: (item.printName || item.name || '').trim(),
            measureUnit: (item.unit ?? '').trim(),
            unitPriceInput: sameCurrency
              ? minorUnitsToAmountInputString(
                  item.defaultPriceMinor ?? 0,
                  itemCur,
                  appLocale
                )
              : '',
            vatExempt: item.vatExempt ?? false,
            vatRatePercent:
              typeof item.vatRatePercent === 'number' &&
              Number.isFinite(item.vatRatePercent)
                ? String(item.vatRatePercent)
                : '20',
            isLicenseLine: !!(
              item.subscriptionPlanId && item.subscriptionPlanId.trim()
            ),
            subscriptionPlanId: item.subscriptionPlanId?.trim() ?? ''
          };
        })
      );
    },
    [catalogById, appLocale, currency]
  );

  const cur = currency.trim() || 'RUB';
  const draftTotals = useMemo(() => {
    let totalGross = 0;
    let totalVat = 0;
    let totalDiscountMinor = 0;
    const vatByRateNonExempt = new Map<number, number>();
    let countedLines = 0;
    let anyExemptLine = false;

    for (const row of rows) {
      const input = tryParseDraftRowForTotals(row, cur, intlLocale);
      if (!input) continue;
      const tot = computeLineTotals(input);
      if (!tot) continue;
      countedLines++;
      const disc = discountMinorForLineInput(input);
      if (disc != null && disc > 0) totalDiscountMinor += disc;
      totalGross += tot.lineGrossMinor;
      totalVat += tot.vatAmountMinor;
      if (input.vatExempt) {
        anyExemptLine = true;
      } else {
        const rate = input.vatRatePercent;
        vatByRateNonExempt.set(
          rate,
          (vatByRateNonExempt.get(rate) ?? 0) + tot.vatAmountMinor
        );
      }
    }

    const rateKeysSorted = [...vatByRateNonExempt.keys()].sort((a, b) => a - b);
    const vatSummaryRows: (
      | { kind: 'exempt'; key: 'exempt' }
      | { kind: 'rate'; key: string; rate: number; vatMinor: number }
    )[] = [];
    if (anyExemptLine) {
      vatSummaryRows.push({ kind: 'exempt', key: 'exempt' });
    }
    for (const rate of rateKeysSorted) {
      vatSummaryRows.push({
        kind: 'rate',
        key: `r-${rate}`,
        rate,
        vatMinor: vatByRateNonExempt.get(rate) ?? 0
      });
    }

    return {
      totalGross,
      totalVat,
      totalDiscountMinor,
      countedLines,
      vatSummaryRows
    };
  }, [rows, cur, intlLocale]);

  const formatRate = useCallback(
    (rate: number) =>
      new Intl.NumberFormat(intlLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
      }).format(rate),
    [intlLocale]
  );

  const toastMutationError = useCallback(
    (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err ?? 'Error');
      const looksLikeErrorKey = /^[a-zA-Z][a-zA-Z0-9]*$/.test(raw);
      const key = `errors.${raw}` as `errors.${string}`;
      if (looksLikeErrorKey && t.has(key)) {
        toast.error(t(key), { duration: 6000 });
        return;
      }
      if (looksLikeErrorKey) {
        toast.error(
          t('errors.generic', {
            defaultValue: 'Something went wrong. Check the form and try again.'
          }),
          { duration: 6000 }
        );
        return;
      }
      toast.error(raw, { duration: 6000 });
    },
    [t]
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const body = buildDraftBody(
        companyId,
        dueLocal,
        currency,
        allowYookassa,
        allowStripe,
        provision,
        rows,
        intlLocale
      );
      return platformCreateInvoice(body as HandlersInvoiceDraftCreateBody);
    },
    onSuccess: (res) => {
      const invId = (res.data as ModelsInvoice | undefined)?.id;
      if (!invId) {
        toastMutationError(new Error('missingInvoiceId'));
        return;
      }
      toast.success(
        t('toastDraftCreated', { defaultValue: 'Draft invoice created.' })
      );
      void qc.invalidateQueries({
        queryKey: getListInvoicesQueryKey()
      });
      router.push(`/platform/invoices/${invId}`);
    },
    onError: toastMutationError
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!initialInvoice?.id) throw new Error('noId');
      const body = buildDraftBody(
        companyId,
        dueLocal,
        currency,
        allowYookassa,
        allowStripe,
        provision,
        rows,
        intlLocale
      );
      return platformPatchInvoiceDraft(
        initialInvoice.id,
        body as HandlersInvoiceDraftUpsertBody
      );
    },
    onSuccess: () => {
      toast.success(t('toastDraftSaved', { defaultValue: 'Draft saved.' }));
      void qc.invalidateQueries({
        queryKey: getListInvoicesQueryKey()
      });
      if (initialInvoice?.id) {
        void qc.invalidateQueries({
          queryKey: getPlatformGetInvoiceQueryKey(initialInvoice.id)
        });
      }
    },
    onError: toastMutationError
  });

  const issueMut = useMutation({
    // Snapshot current server draft, PATCH to latest form state, issue; on issue failure restore the
    // snapshot via PATCH so the user does not lose work. Distinct errors if rollback fails.
    mutationFn: async () => {
      if (!initialInvoice?.id) throw new Error('noId');
      const id = initialInvoice.id;
      const body = buildDraftBody(
        companyId,
        dueLocal,
        currency,
        allowYookassa,
        allowStripe,
        provision,
        rows,
        intlLocale
      );

      const snapshotRes = await platformGetInvoice(id);
      const snapshot = snapshotRes.data as Invoice;
      const originalBody = invoiceToDraftUpsertBody(snapshot);

      await platformPatchInvoiceDraft(
        id,
        body as HandlersInvoiceDraftUpsertBody
      );
      try {
        return await platformIssueInvoice(id);
      } catch (issueErr) {
        const detail =
          issueErr instanceof Error ? issueErr.message : String(issueErr);
        try {
          await platformPatchInvoiceDraft(
            id,
            originalBody as HandlersInvoiceDraftUpsertBody
          );
        } catch (rollbackErr) {
          const rollbackMsg =
            rollbackErr instanceof Error
              ? rollbackErr.message
              : String(rollbackErr);
          throw new Error(
            t('errors.issueInvoiceFailedRollbackFailed', {
              detail,
              rollback: rollbackMsg
            })
          );
        }
        throw new Error(
          t('errors.issueInvoiceFailedDraftRestored', { detail })
        );
      }
    },
    onSuccess: async () => {
      toast.success(t('toastIssued', { defaultValue: 'Invoice issued.' }));
      void qc.invalidateQueries({
        queryKey: getListInvoicesQueryKey()
      });
      if (initialInvoice?.id) {
        await qc.invalidateQueries({
          queryKey: getPlatformGetInvoiceQueryKey(initialInvoice.id)
        });
      }
    },
    onError: (err) => {
      toastMutationError(err);
      void qc.invalidateQueries({
        queryKey: getListInvoicesQueryKey()
      });
      if (initialInvoice?.id) {
        void qc.invalidateQueries({
          queryKey: getPlatformGetInvoiceQueryKey(initialInvoice.id)
        });
      }
    }
  });

  const pending =
    createMut.isPending || saveMut.isPending || issueMut.isPending;

  const rawError =
    (createMut.error as Error)?.message ||
    (saveMut.error as Error)?.message ||
    (issueMut.error as Error)?.message;

  return (
    <div className='mx-auto max-w-5xl space-y-6'>
      <div className='space-y-4'>
        <div className='grid min-w-0 gap-2'>
          <Label>{t('company', { defaultValue: 'Company' })}</Label>
          {isEdit ? (
            <div className='grid min-w-0 gap-1'>
              <Input
                readOnly
                className='text-sm font-normal'
                value={
                  companyForEditLoading
                    ? t('companyLoading', { defaultValue: 'Loading…' })
                    : (companyForEdit?.name ?? companyId)
                }
              />
              {companyForEdit?.name ? (
                <p className='text-muted-foreground font-mono text-xs break-all'>
                  {companyId}
                </p>
              ) : null}
            </div>
          ) : (
            <Combobox
              options={companyOptions}
              value={companyId}
              onChange={setCompanyId}
              disabled={companiesQueryError}
              placeholder={t('companyPlaceholder', {
                defaultValue: 'Select organization…'
              })}
              emptyText={t('companyEmpty', {
                defaultValue: 'No organizations loaded.'
              })}
            />
          )}
        </div>
        {!isEdit && companiesQueryError ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('referenceCompaniesError')}{' '}
            <span className='font-mono text-xs'>
              {(companiesErrorObj as Error)?.message ?? ''}
            </span>
          </p>
        ) : null}
        {isEdit && !!companyId.trim() && companyForEditQueryError ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('referenceCompanyError')}{' '}
            <span className='font-mono text-xs'>
              {(companyForEditErrorObj as Error)?.message ?? ''}
            </span>
          </p>
        ) : null}
        {catalogQueryError ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('referenceCatalogError')}{' '}
            <span className='font-mono text-xs'>
              {(catalogErrorObj as Error)?.message ?? ''}
            </span>
          </p>
        ) : null}
        {plansQueryError ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('referencePlansError')}{' '}
            <span className='font-mono text-xs'>
              {(plansErrorObj as Error)?.message ?? ''}
            </span>
          </p>
        ) : null}
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-x-6 lg:gap-x-8'>
          <div className='grid min-w-0 gap-2'>
            <Label>{t('dueDate', { defaultValue: 'Due date' })}</Label>
            <DateTimePicker
              variant='stacked'
              value={dueLocal}
              onChange={setDueLocal}
            />
          </div>
          <div className='grid min-w-0 content-start gap-2'>
            <Label>{t('currency', { defaultValue: 'Currency' })}</Label>
            <Input
              className='h-10 w-full max-w-full font-mono uppercase'
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={8}
            />
          </div>
        </div>
      </div>

      <div className='grid w-full grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3'>
        <div className='flex items-start gap-2'>
          <Checkbox
            className='mt-0.5'
            id='allow-yoo'
            checked={allowYookassa}
            onCheckedChange={(v) => setAllowYookassa(v === true)}
          />
          <Label htmlFor='allow-yoo' className='cursor-pointer font-normal'>
            {t('allowYookassa', {
              defaultValue: 'Allow YooKassa payment link (tenant requests URL)'
            })}
          </Label>
        </div>
        <div className='flex items-start gap-2 opacity-50'>
          <Checkbox
            className='mt-0.5'
            id='allow-stripe'
            checked={allowStripe}
            disabled
          />
          <Label htmlFor='allow-stripe' className='font-normal'>
            {t('allowStripeDisabled', {
              defaultValue: 'Stripe payment link (not available yet)'
            })}
          </Label>
        </div>
        <div className='flex items-start gap-2'>
          <Checkbox
            className='mt-0.5'
            id='provision'
            checked={provision}
            onCheckedChange={(v) => setProvision(v === true)}
          />
          <Label htmlFor='provision' className='cursor-pointer font-normal'>
            {t('provisionOnPayment', {
              defaultValue: 'Provision subscription when invoice is paid'
            })}
          </Label>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-stretch lg:gap-x-8'>
        <div className='min-w-0 space-y-3'>
          <div className='flex items-center justify-between gap-3 lg:justify-start'>
            <h2 className='text-lg font-semibold'>
              {t('linesTitle', { defaultValue: 'Lines' })}
            </h2>
            <Button
              type='button'
              className='shrink-0 lg:hidden'
              variant='secondary'
              size='sm'
              onClick={() => setRows((r) => [...r, newDraftLineRow()])}
            >
              {t('addLine', { defaultValue: 'Add line' })}
            </Button>
          </div>

          <div className='space-y-4'>
            {rows.map((row, idx) => (
              <div
                key={row.key}
                className='bg-muted/40 space-y-3 rounded-lg border p-4'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='text-muted-foreground text-sm font-medium'>
                    {t('lineNumber', { n: idx + 1 })}
                  </span>
                  {rows.length > 1 && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='text-destructive'
                      onClick={() =>
                        setRows((r) => r.filter((x) => x.key !== row.key))
                      }
                    >
                      {t('removeLine', { defaultValue: 'Remove' })}
                    </Button>
                  )}
                </div>
                <div className='flex flex-col gap-4'>
                  <div className='grid min-w-0 gap-2'>
                    <Label>
                      {t('catalogItem', { defaultValue: 'Catalog item' })}
                    </Label>
                    <Select
                      value={row.catalogItemId || '__none__'}
                      disabled={catalogQueryError}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, catalogItemId: '' }
                                : r
                            )
                          );
                          return;
                        }
                        applyCatalogToRow(row.key, v);
                      }}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue
                          placeholder={t('catalogNone', {
                            defaultValue: 'None (manual)'
                          })}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='__none__'>
                          {t('catalogNone', { defaultValue: 'None (manual)' })}
                        </SelectItem>
                        {catalogItems.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name ?? ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='grid min-w-0 gap-2'>
                    <Label>
                      {t('descriptionPrint', {
                        defaultValue: 'Description (print)'
                      })}
                    </Label>
                    <Input
                      value={row.descriptionPrint}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, descriptionPrint: e.target.value }
                              : r
                          )
                        )
                      }
                    />
                  </div>
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start md:gap-x-6 lg:gap-x-8'>
                    <div className='grid min-w-0 gap-2'>
                      <Label>
                        {t('quantity', { defaultValue: 'Quantity' })}
                      </Label>
                      <Input
                        inputMode='decimal'
                        value={row.quantity}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, quantity: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                    <div className='grid min-w-0 gap-2'>
                      <Label>
                        {t('lineUnit', { defaultValue: 'Unit of measure' })}
                      </Label>
                      <Input
                        value={row.measureUnit}
                        maxLength={32}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, measureUnit: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                    <div className='grid min-w-0 gap-2'>
                      <Label>
                        {t('unitPriceGross', {
                          defaultValue: 'Unit price incl. VAT'
                        })}
                      </Label>
                      <Input
                        inputMode='decimal'
                        value={row.unitPriceInput}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, unitPriceInput: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-x-6 lg:gap-x-8'>
                    <div className='flex min-h-10 items-center gap-2'>
                      <Checkbox
                        id={`vat-ex-${row.key}`}
                        checked={row.vatExempt}
                        onCheckedChange={(v) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, vatExempt: v === true }
                                : r
                            )
                          )
                        }
                      />
                      <Label
                        htmlFor={`vat-ex-${row.key}`}
                        className='cursor-pointer font-normal'
                      >
                        {t('vatExempt', { defaultValue: 'No VAT' })}
                      </Label>
                    </div>
                    {!row.vatExempt && (
                      <div className='grid min-w-0 gap-2'>
                        <Label>
                          {t('vatRatePercent', { defaultValue: 'VAT rate %' })}
                        </Label>
                        <Input
                          inputMode='decimal'
                          value={row.vatRatePercent}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.key === row.key
                                  ? { ...r, vatRatePercent: e.target.value }
                                  : r
                              )
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                  <div className='grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-x-6 lg:gap-x-8'>
                    <div className='grid min-w-0 gap-2'>
                      <Label>
                        {t('discountPercent', { defaultValue: 'Discount %' })}
                      </Label>
                      <Input
                        inputMode='decimal'
                        value={row.discountPercent}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, discountPercent: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                    <div className='grid min-w-0 gap-2'>
                      <Label>
                        {t('discountAmount', {
                          defaultValue: 'Discount amount'
                        })}
                      </Label>
                      <Input
                        inputMode='decimal'
                        value={row.discountAmountInput}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, discountAmountInput: e.target.value }
                                : r
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  <p className='text-muted-foreground text-xs'>
                    {t('lineMoneyHint', {
                      defaultValue:
                        'Amounts are in normal currency units (use a comma as the decimal separator where applicable).'
                    })}
                  </p>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      id={`lic-${row.key}`}
                      checked={row.isLicenseLine}
                      disabled={!provision && !row.isLicenseLine}
                      onCheckedChange={(v) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, isLicenseLine: v === true }
                              : r
                          )
                        )
                      }
                    />
                    <Label
                      htmlFor={`lic-${row.key}`}
                      className={
                        !provision && !row.isLicenseLine
                          ? 'font-normal opacity-50'
                          : 'cursor-pointer font-normal'
                      }
                    >
                      {t('licenseLine', {
                        defaultValue: 'Subscription / license line'
                      })}
                    </Label>
                  </div>
                  {row.isLicenseLine && (
                    <div
                      className={
                        !provision
                          ? 'grid grid-cols-1 gap-4 opacity-60 md:grid-cols-2 md:items-start md:gap-x-6 lg:gap-x-8'
                          : 'grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-x-6 lg:gap-x-8'
                      }
                    >
                      <div className='grid min-w-0 gap-2'>
                        <Label>{t('plan', { defaultValue: 'Plan' })}</Label>
                        <Select
                          value={row.subscriptionPlanId || ''}
                          disabled={!provision || plansQueryError}
                          onValueChange={(v) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.key === row.key
                                  ? { ...r, subscriptionPlanId: v }
                                  : r
                              )
                            )
                          }
                        >
                          <SelectTrigger className='w-full'>
                            <SelectValue
                              placeholder={t('planPlaceholder', {
                                defaultValue: 'Select plan…'
                              })}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {plans
                              .filter((p): p is typeof p & { id: string } =>
                                Boolean(p.id?.trim())
                              )
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='grid min-w-0 gap-2'>
                        <Label>
                          {t('periodStart', {
                            defaultValue: 'Subscription period start'
                          })}
                        </Label>
                        <DateTimePicker
                          variant='stacked'
                          disabled={!provision}
                          value={row.subscriptionPeriodStart}
                          onChange={(v) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.key === row.key
                                  ? { ...r, subscriptionPeriodStart: v }
                                  : r
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='flex min-h-0 w-full flex-col gap-3 lg:min-h-full'>
          <div className='hidden shrink-0 justify-end lg:flex'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setRows((r) => [...r, newDraftLineRow()])}
            >
              {t('addLine', { defaultValue: 'Add line' })}
            </Button>
          </div>
          <aside className='flex min-h-0 flex-1 flex-col lg:sticky lg:top-4'>
            <div className='bg-muted/40 flex min-h-[12rem] flex-1 flex-col gap-4 rounded-lg border p-4 lg:min-h-0'>
              <h3 className='text-base font-semibold'>
                {t('summaryTitle', { defaultValue: 'Totals' })}
              </h3>
              <div className='space-y-2 border-b pb-3'>
                <div className='flex justify-between gap-3 text-sm'>
                  <span className='text-muted-foreground'>
                    {t('grandTotal', { defaultValue: 'Grand total' })}
                  </span>
                  <span className='font-semibold tabular-nums'>
                    {draftTotals.countedLines === 0
                      ? '—'
                      : formatPriceMinorUnits(
                          draftTotals.totalGross,
                          cur,
                          intlLocale
                        )}
                  </span>
                </div>
                {draftTotals.countedLines > 0 &&
                draftTotals.totalDiscountMinor > 0 ? (
                  <div className='flex justify-between gap-3 text-sm'>
                    <span className='text-muted-foreground'>
                      {t('discountTotal', { defaultValue: 'Discount' })}
                    </span>
                    <span className='text-muted-foreground tabular-nums'>
                      {formatPriceMinorUnits(
                        draftTotals.totalDiscountMinor,
                        cur,
                        intlLocale
                      )}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className='flex flex-1 flex-col space-y-2'>
                <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {t('vatSectionTitle', { defaultValue: 'VAT' })}
                </p>
                {draftTotals.countedLines === 0 ? (
                  <p className='text-muted-foreground text-sm'>—</p>
                ) : (
                  <>
                    <ul className='space-y-1.5 text-sm'>
                      {draftTotals.vatSummaryRows.map((r) => (
                        <li key={r.key} className='flex justify-between gap-3'>
                          <span className='text-muted-foreground'>
                            {r.kind === 'exempt'
                              ? t('vatRowExempt', {
                                  defaultValue: 'No VAT (exempt)'
                                })
                              : t('vatRowRate', {
                                  rate: formatRate(r.rate),
                                  defaultValue: '{rate}%'
                                })}
                          </span>
                          <span className='shrink-0 tabular-nums'>
                            {r.kind === 'exempt'
                              ? null
                              : formatPriceMinorUnits(
                                  r.vatMinor,
                                  cur,
                                  intlLocale
                                )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className='mt-3 flex justify-between gap-3 border-t pt-2 text-sm font-medium'>
                      <span>
                        {t('vatTotal', { defaultValue: 'Total VAT' })}
                      </span>
                      <span className='tabular-nums'>
                        {formatPriceMinorUnits(
                          draftTotals.totalVat,
                          cur,
                          intlLocale
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {rawError && (
        <p className='text-destructive text-sm'>
          {t(`errors.${rawError}`, { defaultValue: rawError })}
        </p>
      )}

      <div className='flex flex-wrap gap-2'>
        {!isEdit ? (
          <Button
            disabled={pending || !companyId.trim() || referenceDataBlocked}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending && <Spinner className='mr-2 h-4 w-4' />}
            {t('createDraft', { defaultValue: 'Create draft' })}
          </Button>
        ) : (
          <>
            <Button
              disabled={pending || referenceDataBlocked}
              variant='secondary'
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending && <Spinner className='mr-2 h-4 w-4' />}
              {t('saveDraft', { defaultValue: 'Save draft' })}
            </Button>
            <Button
              disabled={pending || referenceDataBlocked}
              onClick={() => issueMut.mutate()}
            >
              {issueMut.isPending && <Spinner className='mr-2 h-4 w-4' />}
              {t('issue', { defaultValue: 'Issue invoice' })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
