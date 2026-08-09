import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';

export interface TransferDisplayLine {
  kind: 'service' | 'counter' | 'zone';
  from: string;
  to: string;
}

function trimmed(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function localizedTransferServiceName(
  event: ClientVisitTransferEvent,
  side: 'from' | 'to',
  locale: string
): string | null {
  const lang = locale.split('-')[0]?.toLowerCase() ?? 'en';
  const name = trimmed(
    side === 'from' ? event.fromServiceName : event.toServiceName
  );
  const nameRu = trimmed(
    side === 'from' ? event.fromServiceNameRu : event.toServiceNameRu
  );
  const nameEn = trimmed(
    side === 'from' ? event.fromServiceNameEn : event.toServiceNameEn
  );

  if (lang === 'ru' && nameRu) return nameRu;
  if (lang === 'en' && nameEn) return nameEn;
  return name ?? nameRu ?? nameEn;
}

export function getTransferDisplayLines(
  event: ClientVisitTransferEvent,
  locale: string
): TransferDisplayLine[] {
  const candidates: TransferDisplayLine[] = [
    {
      kind: 'service',
      from: localizedTransferServiceName(event, 'from', locale) ?? '',
      to: localizedTransferServiceName(event, 'to', locale) ?? ''
    },
    {
      kind: 'counter',
      from: trimmed(event.fromCounterName) ?? '',
      to: trimmed(event.toCounterName) ?? ''
    },
    {
      kind: 'zone',
      from: trimmed(event.fromZoneLabel) ?? '',
      to: trimmed(event.toZoneLabel) ?? ''
    }
  ];

  return candidates.filter((line) => line.from || line.to);
}

export function getLatestTransfer(
  trail: readonly ClientVisitTransferEvent[] | undefined
): ClientVisitTransferEvent | null {
  if (!trail?.length) return null;

  return trail.reduce((latest, event) =>
    Date.parse(event.at) > Date.parse(latest.at) ? event : latest
  );
}
