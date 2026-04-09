import type { Counterparty, PartyType } from '@quokkaq/shared-types';

type DaDataPartyData = Record<string, unknown>;

/** Map DaData findById/suggest party item into our counterparty shape (best effort). */
export function mapDaDataPartySuggestionToCounterparty(suggestion: {
  value?: string;
  unrestricted_value?: string;
  data?: DaDataPartyData;
}): Partial<Counterparty> {
  const d = suggestion.data ?? {};
  const type = String(d.type ?? '').toUpperCase();
  const inn = String(d.inn ?? '').trim();
  const kpp = d.kpp != null ? String(d.kpp).trim() : '';
  const ogrnRaw = d.ogrn != null ? String(d.ogrn).trim() : '';

  let partyType: PartyType = 'legal_entity';
  if (type === 'LEGAL') {
    partyType = 'legal_entity';
  } else if (type === 'INDIVIDUAL') {
    partyType =
      ogrnRaw.length === 15 && /^\d{15}$/.test(ogrnRaw)
        ? 'sole_proprietor'
        : 'individual';
  }

  const nameBlock = d.name as Record<string, unknown> | undefined;
  const fullName =
    (nameBlock?.full_with_opf as string) ||
    (nameBlock?.full as string) ||
    (suggestion.unrestricted_value as string) ||
    (suggestion.value as string) ||
    '';

  const shortName =
    (nameBlock?.short_with_opf as string) ||
    (nameBlock?.short as string) ||
    '';

  const addr = d.address as Record<string, unknown> | undefined;
  const addrData = (addr?.data as Record<string, unknown> | undefined) ?? {};
  const legalUnrestricted =
    (addr?.unrestricted_value as string) ||
    (addr?.value as string) ||
    '';

  const base: Partial<Counterparty> = {
    schemaVersion: 1,
    partyType,
    inn: inn || undefined,
    fullName: fullName || undefined,
    shortName: shortName || undefined,
    addresses: {
      legal: {
        unrestricted: legalUnrestricted || undefined,
        postalCode:
          addrData.postal_code != null
            ? String(addrData.postal_code)
            : undefined,
        fiasId:
          addrData.fias_id != null ? String(addrData.fias_id) : undefined
      }
    }
  };

  if (partyType === 'legal_entity') {
    if (kpp) base.kpp = kpp;
    if (ogrnRaw && /^\d{13}$/.test(ogrnRaw)) base.ogrn = ogrnRaw;
  } else if (partyType === 'sole_proprietor') {
    if (ogrnRaw && /^\d{15}$/.test(ogrnRaw)) base.ogrnip = ogrnRaw;
  }

  return base;
}

export function formatAddressSuggestionLabel(s: {
  value?: string;
  unrestricted_value?: string;
  data?: Record<string, unknown>;
}): string {
  const data = s.data ?? {};
  const postal =
    data.postal_code != null ? String(data.postal_code).trim() : '';
  const line = String(s.unrestricted_value || s.value || '').trim();
  if (postal && line) return `${postal} — ${line}`;
  return line || postal;
}

export function addressFieldsFromDaDataSuggestion(s: {
  value?: string;
  unrestricted_value?: string;
  data?: Record<string, unknown>;
}): {
  unrestricted: string;
  postalCode?: string;
  fiasId?: string;
} {
  const data = s.data ?? {};
  return {
    unrestricted: String(s.unrestricted_value || s.value || '').trim(),
    postalCode:
      data.postal_code != null ? String(data.postal_code) : undefined,
    fiasId: data.fias_id != null ? String(data.fias_id) : undefined
  };
}
