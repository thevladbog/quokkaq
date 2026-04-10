'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PaymentAccountsSchema,
  type PaymentAccount
} from '@quokkaq/shared-types';
import { dadataApi } from '@/lib/api';
import {
  draftPaymentAccountFromBankSuggestion,
  formatBankSuggestionLabel
} from '@/lib/map-dadata-bank';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const PAY_MAX = 30;

export function emptyPaymentAccount(): PaymentAccount {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    bankName: '',
    bic: '',
    correspondentAccount: '',
    accountNumber: '',
    isDefault: false
  };
}

function loosePaymentAccountFromUnknown(
  item: unknown,
  idx: number
): PaymentAccount {
  const base = emptyPaymentAccount();
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : base.id + `-row-${idx}`;
    return {
      id,
      bankName: typeof o.bankName === 'string' ? o.bankName : '',
      bic: typeof o.bic === 'string' ? o.bic : '',
      correspondentAccount:
        typeof o.correspondentAccount === 'string'
          ? o.correspondentAccount
          : '',
      accountNumber:
        typeof o.accountNumber === 'string' ? o.accountNumber : '',
      isDefault: o.isDefault === true
    };
  }
  return { ...base, id: `${base.id}-fallback-${idx}` };
}

export function parsePaymentAccountsFromApi(raw: unknown): PaymentAccount[] {
  if (!Array.isArray(raw)) return [];
  const parsed = PaymentAccountsSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data.map((row, idx) => ({
      ...row,
      id:
        row.id?.trim() ||
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pa-${idx}-${Date.now()}`)
    }));
  }
  const loose = raw.map((item, idx) => loosePaymentAccountFromUnknown(item, idx));
  if (loose.length > 0 && !loose.some((a) => a.isDefault)) {
    loose[0] = { ...loose[0], isDefault: true };
  }
  return loose;
}

type BankHit = {
  value?: string;
  unrestricted_value?: string;
  data?: Record<string, unknown>;
};

type Props = {
  value: PaymentAccount[];
  onChange: (next: PaymentAccount[]) => void;
  disabled?: boolean;
  canUseDadata: boolean;
  dadataScope: 'tenant' | 'platform';
};

export function PaymentAccountsForm({
  value: accounts,
  onChange,
  disabled,
  canUseDadata,
  dadataScope
}: Props) {
  const t = useTranslations('organization');
  const [bicSuggestRow, setBicSuggestRow] = useState<number | null>(null);
  const [bicHits, setBicHits] = useState<BankHit[]>([]);
  const [bicBusy, setBicBusy] = useState(false);
  const blurTimerRef = useRef<number | null>(null);

  const activeBic =
    bicSuggestRow != null && accounts[bicSuggestRow]
      ? (accounts[bicSuggestRow].bic ?? '')
      : '';

  const cancelBicBlurTimer = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!canUseDadata) {
      const id = window.setTimeout(() => {
        setBicHits([]);
        setBicBusy(false);
      }, 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [canUseDadata]);

  useEffect(() => {
    if (!canUseDadata || bicSuggestRow == null) {
      return;
    }
    const q = activeBic.trim();
    let cancelled = false;

    if (q.length < 3) {
      const clearId = window.setTimeout(() => {
        if (!cancelled) {
          setBicHits([]);
          setBicBusy(false);
        }
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(clearId);
      };
    }

    const fetchId = window.setTimeout(() => {
      if (cancelled) return;
      setBicBusy(true);
      dadataApi
        .suggestBank(dadataScope, { query: q, count: 8 })
        .then((res) => {
          if (cancelled) return;
          const list = (res as { suggestions?: unknown[] })?.suggestions;
          setBicHits(Array.isArray(list) ? (list as BankHit[]) : []);
        })
        .catch(() => {
          if (!cancelled) setBicHits([]);
        })
        .finally(() => {
          if (!cancelled) setBicBusy(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(fetchId);
    };
  }, [activeBic, bicSuggestRow, canUseDadata, dadataScope]);

  const updateRow = (index: number, patch: Partial<PaymentAccount>) => {
    const next = accounts.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange(next);
  };

  const setDefault = (id: string | undefined) => {
    if (!id) return;
    onChange(
      accounts.map((a) => ({
        ...a,
        isDefault: a.id === id
      }))
    );
  };

  const addRow = () => {
    if (accounts.length >= PAY_MAX) return;
    const row = emptyPaymentAccount();
    onChange([...accounts, { ...row, isDefault: accounts.length === 0 }]);
  };

  const removeRow = (index: number) => {
    cancelBicBlurTimer();
    const removed = accounts[index];
    const next = accounts.filter((_, i) => i !== index);
    if (bicSuggestRow === index) {
      setBicSuggestRow(null);
      setBicHits([]);
      setBicBusy(false);
    } else if (bicSuggestRow != null && bicSuggestRow > index) {
      setBicSuggestRow(bicSuggestRow - 1);
    }
    if (
      next.length > 0 &&
      removed?.isDefault &&
      !next.some((a) => a.isDefault)
    ) {
      next[0] = { ...next[0], isDefault: true };
    }
    onChange(next);
  };

  const applyBankSuggestion = (rowIndex: number, hit: BankHit) => {
    const draft = draftPaymentAccountFromBankSuggestion(hit);
    const row = accounts[rowIndex];
    if (!row) return;
    updateRow(rowIndex, {
      ...draft,
      id: row.id
    });
    setBicHits([]);
  };

  return (
    <div className='space-y-4'>
      {accounts.map((row, index) => (
        <div
          key={row.id ?? `idx-${index}`}
          className='bg-muted/40 space-y-3 rounded-lg border p-4'
        >
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-muted-foreground text-sm font-medium'>
              {t('paymentAccountsCardTitle', { index: index + 1 })}
            </span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={disabled}
              onClick={() => removeRow(index)}
            >
              {t('paymentAccountsRemove')}
            </Button>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-2 sm:col-span-2'>
              <Label htmlFor={`pa-bank-${index}`}>
                {t('paymentAccountsBankName')}
              </Label>
              <Input
                id={`pa-bank-${index}`}
                disabled={disabled}
                value={row.bankName ?? ''}
                onChange={(e) => updateRow(index, { bankName: e.target.value })}
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={`pa-bic-${index}`}>
                {t('paymentAccountsBic')}
              </Label>
              <Input
                id={`pa-bic-${index}`}
                disabled={disabled}
                value={row.bic ?? ''}
                onChange={(e) => updateRow(index, { bic: e.target.value })}
                onFocus={() => {
                  cancelBicBlurTimer();
                  setBicSuggestRow(index);
                }}
                onBlur={() => {
                  cancelBicBlurTimer();
                  blurTimerRef.current = window.setTimeout(() => {
                    blurTimerRef.current = null;
                    setBicSuggestRow((cur) => (cur === index ? null : cur));
                    setBicHits([]);
                    setBicBusy(false);
                  }, 200);
                }}
                placeholder={t('paymentAccountsBicPlaceholder')}
                autoComplete='off'
              />
              {canUseDadata &&
                bicSuggestRow === index &&
                (bicBusy || bicHits.length > 0) && (
                  <p className='text-muted-foreground text-xs'>
                    {bicBusy
                      ? t('paymentAccountsSuggestLoading')
                      : t('paymentAccountsBicHint')}
                  </p>
                )}
              {canUseDadata &&
                bicSuggestRow === index &&
                bicHits.length > 0 && (
                  <ul className='bg-background max-h-48 overflow-auto rounded-md border text-sm shadow-sm'>
                    {bicHits.map((h, i) => (
                      <li key={i}>
                        <button
                          type='button'
                          className='hover:bg-accent w-full px-3 py-2 text-left'
                          disabled={disabled}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyBankSuggestion(index, h)}
                        >
                          {formatBankSuggestionLabel(h)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>

            <div className='grid gap-2'>
              <Label htmlFor={`pa-ks-${index}`}>
                {t('paymentAccountsCorrespondent')}
              </Label>
              <Input
                id={`pa-ks-${index}`}
                disabled={disabled}
                value={row.correspondentAccount ?? ''}
                onChange={(e) =>
                  updateRow(index, { correspondentAccount: e.target.value })
                }
              />
            </div>

            <div className='grid gap-2 sm:col-span-2'>
              <Label htmlFor={`pa-rs-${index}`}>
                {t('paymentAccountsNumber')}
              </Label>
              <Input
                id={`pa-rs-${index}`}
                disabled={disabled}
                value={row.accountNumber ?? ''}
                onChange={(e) =>
                  updateRow(index, { accountNumber: e.target.value })
                }
              />
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Checkbox
              id={`pa-def-${index}`}
              disabled={disabled}
              checked={!!row.isDefault}
              onCheckedChange={(checked) => {
                if (checked === true) {
                  setDefault(row.id);
                  return;
                }
                if (accounts.length <= 1) {
                  return;
                }
                const next = accounts.map((a, i) => ({
                  ...a,
                  isDefault: i !== index && !!a.isDefault
                }));
                if (!next.some((a) => a.isDefault)) {
                  const j = index === 0 ? 1 : 0;
                  if (j < next.length) {
                    next[j] = { ...next[j], isDefault: true };
                  }
                }
                onChange(next);
              }}
            />
            <Label
              htmlFor={`pa-def-${index}`}
              className='text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
            >
              {t('paymentAccountsDefault')}
            </Label>
          </div>
        </div>
      ))}

      <Button
        type='button'
        variant='outline'
        disabled={disabled || accounts.length >= PAY_MAX}
        onClick={() => addRow()}
      >
        {t('paymentAccountsAdd')}
      </Button>
    </div>
  );
}
