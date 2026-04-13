import type { Ticket } from '@/lib/api';

/** Localized service title from embedded `ticket.service` (API preloads it for client visits). */
export function ticketServiceDisplayName(
  ticket: Pick<Ticket, 'serviceId' | 'service'>,
  locale: string
): string {
  const s = ticket.service;
  if (!s) return ticket.serviceId;
  const lang = locale.split('-')[0]?.toLowerCase() ?? 'en';
  if (lang === 'ru' && s.nameRu) return s.nameRu;
  if (lang === 'en' && s.nameEn) return s.nameEn;
  return s.name ?? s.nameRu ?? s.nameEn ?? ticket.serviceId;
}
