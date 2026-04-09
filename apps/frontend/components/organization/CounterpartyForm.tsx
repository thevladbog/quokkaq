'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CounterpartySchema,
  type Counterparty,
  type PartyType
} from '@quokkaq/shared-types';
import { dadataApi } from '@/lib/api';
import {
  addressFieldsFromDaDataSuggestion,
  formatAddressSuggestionLabel,
  mapDaDataPartySuggestionToCounterparty
} from '@/lib/map-dadata-party';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const PARTY_TYPES: PartyType[] = [
  'legal_entity',
  'sole_proprietor',
  'individual'
];

export function emptyCounterparty(): Counterparty {
  return {
    schemaVersion: 1,
    partyType: 'legal_entity',
    inn: '',
    kpp: '',
    ogrn: '',
    ogrnip: '',
    fullName: '',
    shortName: '',
    phone: '',
    email: '',
    passport: {
      series: '',
      number: '',
      issuedBy: '',
      issueDate: ''
    },
    addresses: {
      legal: { unrestricted: '', postalCode: '', fiasId: '' },
      actual: { unrestricted: '', postalCode: '', fiasId: '' },
      postal: { unrestricted: '', postalCode: '', fiasId: '' }
    },
    contacts: [],
    edo: { operator: '', participantId: '' }
  };
}

export function parseCounterpartyFromApi(raw: unknown): Counterparty {
  const base = emptyCounterparty();
  if (raw == null || typeof raw !== 'object') return base;
  const parsed = CounterpartySchema.safeParse(raw);
  if (parsed.success) {
    return {
      ...base,
      ...parsed.data,
      addresses: {
        legal: { ...base.addresses?.legal, ...parsed.data.addresses?.legal },
        actual: { ...base.addresses?.actual, ...parsed.data.addresses?.actual },
        postal: { ...base.addresses?.postal, ...parsed.data.addresses?.postal }
      },
      passport: { ...base.passport, ...parsed.data.passport },
      edo: { ...base.edo, ...parsed.data.edo },
      contacts: parsed.data.contacts?.length
        ? parsed.data.contacts
        : base.contacts
    };
  }
  return base;
}

type Props = {
  value: Counterparty;
  onChange: (next: Counterparty) => void;
  disabled?: boolean;
  canUseDadata: boolean;
  canUseCleaner: boolean;
  dadataScope: 'tenant' | 'platform';
};

export function CounterpartyForm({
  value,
  onChange,
  disabled,
  canUseDadata,
  canUseCleaner,
  dadataScope
}: Props) {
  const t = useTranslations('organization.counterparty');
  const [innBusy, setInnBusy] = useState(false);
  const [partyQ, setPartyQ] = useState('');
  const [partyDebounced, setPartyDebounced] = useState('');
  const [partyHits, setPartyHits] = useState<
    { value?: string; data?: Record<string, unknown> }[]
  >([]);
  const [addrQ, setAddrQ] = useState('');
  const [addrDebounced, setAddrDebounced] = useState('');
  const [addrHits, setAddrHits] = useState<
    { value?: string; unrestricted_value?: string; data?: Record<string, unknown> }[]
  >([]);
  const [addrBusy, setAddrBusy] = useState(false);
  const [cleanBusy, setCleanBusy] = useState(false);

  const setField = useCallback(
    (patch: Partial<Counterparty>) => {
      onChange({ ...value, ...patch });
    },
    [onChange, value]
  );

  const setAddr = (
    kind: 'legal' | 'actual' | 'postal',
    patch: Partial<NonNullable<Counterparty['addresses']>['legal']>
  ) => {
    onChange({
      ...value,
      addresses: {
        ...value.addresses,
        [kind]: { ...value.addresses?.[kind], ...patch }
      }
    });
  };

  useEffect(() => {
    const id = setTimeout(() => setPartyDebounced(partyQ), 400);
    return () => clearTimeout(id);
  }, [partyQ]);

  useEffect(() => {
    if (!canUseDadata || partyDebounced.trim().length < 2) {
      setPartyHits([]);
      return;
    }
    let cancelled = false;
    dadataApi
      .suggestParty(dadataScope, {
        query: partyDebounced.trim(),
        count: 8
      })
      .then((res) => {
        if (cancelled) return;
        const list = (res as { suggestions?: unknown[] })?.suggestions;
        setPartyHits(Array.isArray(list) ? (list as typeof partyHits) : []);
      })
      .catch(() => setPartyHits([]));
    return () => {
      cancelled = true;
    };
  }, [canUseDadata, dadataScope, partyDebounced]);

  useEffect(() => {
    const id = setTimeout(() => setAddrDebounced(addrQ), 350);
    return () => clearTimeout(id);
  }, [addrQ]);

  useEffect(() => {
    if (!canUseDadata || addrDebounced.trim().length < 3) {
      setAddrHits([]);
      return;
    }
    let cancelled = false;
    setAddrBusy(true);
    dadataApi
      .suggestAddress(dadataScope, {
        query: addrDebounced.trim(),
        count: 8
      })
      .then((res) => {
        if (cancelled) return;
        const list = (res as { suggestions?: unknown[] })?.suggestions;
        setAddrHits(Array.isArray(list) ? (list as typeof addrHits) : []);
      })
      .catch(() => setAddrHits([]))
      .finally(() => {
        if (!cancelled) setAddrBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addrDebounced, canUseDadata, dadataScope]);

  const fillByInn = async () => {
    const inn = (value.inn ?? '').trim();
    if (!inn || !canUseDadata) return;
    setInnBusy(true);
    try {
      const res = await dadataApi.findPartyByInn(dadataScope, inn);
      const list = (res as { suggestions?: unknown[] })?.suggestions;
      const first = Array.isArray(list) ? list[0] : undefined;
      if (first && typeof first === 'object') {
        const mapped = mapDaDataPartySuggestionToCounterparty(
          first as {
            value?: string;
            unrestricted_value?: string;
            data?: Record<string, unknown>;
          }
        );
        onChange({
          ...value,
          ...mapped,
          addresses: {
            legal: {
              ...value.addresses?.legal,
              ...mapped.addresses?.legal
            },
            actual: value.addresses?.actual,
            postal: value.addresses?.postal
          }
        });
      }
    } finally {
      setInnBusy(false);
    }
  };

  const cleanLegal = async () => {
    const line = (value.addresses?.legal?.unrestricted ?? '').trim();
    if (!line || !canUseCleaner) return;
    setCleanBusy(true);
    try {
      const res = await dadataApi.cleanAddress(dadataScope, [line]);
      const arr = res as unknown[];
      const row = Array.isArray(arr) && arr[0] && typeof arr[0] === 'object' ? (arr[0] as Record<string, unknown>) : null;
      if (row) {
        const unrestricted = String(row.result ?? row.source ?? line);
        const postalCode =
          row.postal_code != null ? String(row.postal_code) : undefined;
        setAddr('legal', { unrestricted, postalCode });
      }
    } finally {
      setCleanBusy(false);
    }
  };

  const pt = value.partyType;

  return (
    <div className='space-y-4'>
      <div className='grid gap-2'>
        <Label>{t('partyType')}</Label>
        <Select
          disabled={disabled}
          value={pt}
          onValueChange={(v) =>
            setField({ partyType: v as PartyType })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARTY_TYPES.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`partyTypeOptions.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end'>
        <div className='grid gap-2'>
          <Label>{t('inn')}</Label>
          <Input
            disabled={disabled}
            value={value.inn ?? ''}
            onChange={(e) => setField({ inn: e.target.value })}
          />
        </div>
        <Button
          type='button'
          variant='secondary'
          disabled={disabled || !canUseDadata || innBusy}
          onClick={() => void fillByInn()}
        >
          {innBusy ? t('innLoading') : t('fillByInn')}
        </Button>
      </div>

      {canUseDadata && (
        <div className='grid gap-2'>
          <Label>{t('nameSuggest')}</Label>
          <Input
            disabled={disabled}
            value={partyQ}
            onChange={(e) => setPartyQ(e.target.value)}
            placeholder={t('nameSuggestPlaceholder')}
          />
          {partyHits.length > 0 && (
            <ul className='bg-muted max-h-48 overflow-auto rounded-md border text-sm'>
              {partyHits.map((h, i) => (
                <li key={i}>
                  <button
                    type='button'
                    className='hover:bg-accent w-full px-3 py-2 text-left'
                    disabled={disabled}
                    onClick={() => {
                      const mapped = mapDaDataPartySuggestionToCounterparty(h);
                      onChange({
                        ...value,
                        ...mapped,
                        addresses: {
                          legal: {
                            ...value.addresses?.legal,
                            ...mapped.addresses?.legal
                          },
                          actual: value.addresses?.actual,
                          postal: value.addresses?.postal
                        }
                      });
                      setPartyHits([]);
                      setPartyQ('');
                    }}
                  >
                    {h.value ?? formatAddressSuggestionLabel(h as { value?: string; unrestricted_value?: string; data?: Record<string, unknown> })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pt === 'legal_entity' && (
        <>
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label>{t('kpp')}</Label>
              <Input
                disabled={disabled}
                value={value.kpp ?? ''}
                onChange={(e) => setField({ kpp: e.target.value })}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('ogrn')}</Label>
              <Input
                disabled={disabled}
                value={value.ogrn ?? ''}
                onChange={(e) => setField({ ogrn: e.target.value })}
              />
            </div>
          </div>
        </>
      )}

      {pt === 'sole_proprietor' && (
        <div className='grid gap-2'>
          <Label>{t('ogrnip')}</Label>
          <Input
            disabled={disabled}
            value={value.ogrnip ?? ''}
            onChange={(e) => setField({ ogrnip: e.target.value })}
          />
        </div>
      )}

      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='grid gap-2'>
          <Label>{t('fullName')}</Label>
          <Input
            disabled={disabled}
            value={value.fullName ?? ''}
            onChange={(e) => setField({ fullName: e.target.value })}
          />
        </div>
        <div className='grid gap-2'>
          <Label>{t('shortName')}</Label>
          <Input
            disabled={disabled}
            value={value.shortName ?? ''}
            onChange={(e) => setField({ shortName: e.target.value })}
          />
        </div>
      </div>

      {pt === 'individual' && (
        <div className='grid gap-2 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label>{t('passportSeries')}</Label>
            <Input
              disabled={disabled}
              value={value.passport?.series ?? ''}
              onChange={(e) =>
                setField({
                  passport: { ...value.passport, series: e.target.value }
                })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label>{t('passportNumber')}</Label>
            <Input
              disabled={disabled}
              value={value.passport?.number ?? ''}
              onChange={(e) =>
                setField({
                  passport: { ...value.passport, number: e.target.value }
                })
              }
            />
          </div>
          <div className='grid gap-2 sm:col-span-2'>
            <Label>{t('passportIssuedBy')}</Label>
            <Input
              disabled={disabled}
              value={value.passport?.issuedBy ?? ''}
              onChange={(e) =>
                setField({
                  passport: { ...value.passport, issuedBy: e.target.value }
                })
              }
            />
          </div>
          <div className='grid gap-2 sm:col-span-2'>
            <Label>{t('passportIssueDate')}</Label>
            <Input
              disabled={disabled}
              value={value.passport?.issueDate ?? ''}
              onChange={(e) =>
                setField({
                  passport: { ...value.passport, issueDate: e.target.value }
                })
              }
            />
          </div>
        </div>
      )}

      <div className='space-y-3 border-t pt-4'>
        <p className='text-muted-foreground text-sm font-medium'>
          {t('addressLegal')}
        </p>
        {canUseDadata && (
          <div className='grid gap-2'>
            <Label>{t('addressSuggest')}</Label>
            <Input
              disabled={disabled}
              value={addrQ}
              onChange={(e) => setAddrQ(e.target.value)}
              placeholder={t('addressSuggestPlaceholder')}
            />
            {addrBusy && (
              <p className='text-muted-foreground text-xs'>{t('loading')}</p>
            )}
            {addrHits.length > 0 && (
              <ul className='bg-muted max-h-40 overflow-auto rounded-md border text-sm'>
                {addrHits.map((h, i) => (
                  <li key={i}>
                    <button
                      type='button'
                      disabled={disabled}
                      className='hover:bg-accent w-full px-3 py-2 text-left'
                      onClick={() => {
                        const f = addressFieldsFromDaDataSuggestion(h);
                        setAddr('legal', f);
                        setAddrHits([]);
                        setAddrQ('');
                      }}
                    >
                      {formatAddressSuggestionLabel(h)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className='grid gap-2'>
          <Label>{t('addressUnrestricted')}</Label>
          <Input
            disabled={disabled}
            value={value.addresses?.legal?.unrestricted ?? ''}
            onChange={(e) =>
              setAddr('legal', { unrestricted: e.target.value })
            }
          />
        </div>
        <div className='grid gap-2 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label>{t('postalCode')}</Label>
            <Input
              disabled={disabled}
              value={value.addresses?.legal?.postalCode ?? ''}
              onChange={(e) =>
                setAddr('legal', { postalCode: e.target.value })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label>{t('fiasId')}</Label>
            <Input
              disabled={disabled}
              value={value.addresses?.legal?.fiasId ?? ''}
              onChange={(e) => setAddr('legal', { fiasId: e.target.value })}
            />
          </div>
        </div>
        {canUseCleaner && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled || cleanBusy}
            onClick={() => void cleanLegal()}
          >
            {cleanBusy ? t('cleanLoading') : t('normalizeAddress')}
          </Button>
        )}
      </div>

      <div className='space-y-2 border-t pt-4'>
        <p className='text-muted-foreground text-sm font-medium'>
          {t('addressActual')}
        </p>
        <Input
          disabled={disabled}
          value={value.addresses?.actual?.unrestricted ?? ''}
          onChange={(e) =>
            setAddr('actual', { unrestricted: e.target.value })
          }
        />
      </div>

      <div className='space-y-2 border-t pt-4'>
        <p className='text-muted-foreground text-sm font-medium'>
          {t('addressPostal')}
        </p>
        <Input
          disabled={disabled}
          value={value.addresses?.postal?.unrestricted ?? ''}
          onChange={(e) =>
            setAddr('postal', { unrestricted: e.target.value })
          }
        />
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='grid gap-2'>
          <Label>{t('phone')}</Label>
          <Input
            disabled={disabled}
            value={value.phone ?? ''}
            onChange={(e) => setField({ phone: e.target.value })}
          />
        </div>
        <div className='grid gap-2'>
          <Label>{t('email')}</Label>
          <Input
            disabled={disabled}
            type='email'
            value={value.email ?? ''}
            onChange={(e) => setField({ email: e.target.value })}
          />
        </div>
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        <div className='grid gap-2'>
          <Label>{t('edoOperator')}</Label>
          <Input
            disabled={disabled}
            value={value.edo?.operator ?? ''}
            onChange={(e) =>
              setField({
                edo: { ...value.edo, operator: e.target.value }
              })
            }
          />
        </div>
        <div className='grid gap-2'>
          <Label>{t('edoId')}</Label>
          <Input
            disabled={disabled}
            value={value.edo?.participantId ?? ''}
            onChange={(e) =>
              setField({
                edo: { ...value.edo, participantId: e.target.value }
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
