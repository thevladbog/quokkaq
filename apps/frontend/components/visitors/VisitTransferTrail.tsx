'use client';

import { useTranslations } from 'next-intl';
import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';
import { cn } from '@/lib/utils';

function dash(v: string | undefined) {
  const s = (v ?? '').trim();
  return s || '—';
}

/** Matches `ticketServiceDisplayName` in `lib/ticket-display.ts` (ru → nameRu, en → nameEn, else name). */
function localizedTransferServiceName(
  ev: ClientVisitTransferEvent,
  side: 'from' | 'to',
  locale: string
): string {
  const lang = locale.split('-')[0]?.toLowerCase() ?? 'en';
  const name = side === 'from' ? ev.fromServiceName : ev.toServiceName;
  const nameRu = side === 'from' ? ev.fromServiceNameRu : ev.toServiceNameRu;
  const nameEn = side === 'from' ? ev.fromServiceNameEn : ev.toServiceNameEn;
  if (lang === 'ru' && nameRu?.trim()) {
    return nameRu.trim();
  }
  if (lang === 'en' && nameEn?.trim()) {
    return nameEn.trim();
  }
  return name?.trim() || nameRu?.trim() || nameEn?.trim() || '—';
}

export function VisitTransferTrail({
  trail,
  locale,
  className,
  embedded
}: {
  trail: ClientVisitTransferEvent[] | undefined;
  locale: string;
  className?: string;
  /** When true, omit top rule (e.g. inside a table cell). */
  embedded?: boolean;
}) {
  const t = useTranslations('staff');

  if (!trail?.length) {
    return null;
  }

  const formatWhen = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div
      className={cn(
        !embedded && 'border-border/30 mt-1 border-t pt-1.5',
        embedded && 'mt-1',
        className
      )}
    >
      <p className='text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase'>
        {t('visitor_context.transfer_history_title')}
      </p>
      <ul className='space-y-1.5'>
        {trail.map((ev, idx) => {
          const fromSvc = localizedTransferServiceName(ev, 'from', locale);
          const toSvc = localizedTransferServiceName(ev, 'to', locale);
          const zoneTransferToQueue =
            ev.transferKind === 'zone' &&
            !!ev.fromCounterName?.trim() &&
            !ev.toCounterName?.trim();
          const hasCounter =
            !!ev.fromCounterName?.trim() || !!ev.toCounterName?.trim();
          const hasZone = !!(ev.fromZoneLabel || ev.toZoneLabel);
          return (
            <li
              key={`${ev.at}-${idx}`}
              className='text-muted-foreground text-[11px] leading-snug'
            >
              <div className='text-foreground/80 font-medium'>
                {formatWhen(ev.at)}
              </div>
              <div>
                {t('visitor_context.transfer_service_flow', {
                  from: dash(fromSvc),
                  to: dash(toSvc)
                })}
              </div>
              {hasCounter ? (
                <div>
                  {zoneTransferToQueue && ev.fromCounterName?.trim()
                    ? t('visitor_context.transfer_counter_to_zone_queue', {
                        from: ev.fromCounterName.trim()
                      })
                    : t('visitor_context.transfer_counter_flow', {
                        from: dash(ev.fromCounterName),
                        to: dash(ev.toCounterName)
                      })}
                </div>
              ) : null}
              {hasZone ? (
                <div>
                  {t('visitor_context.transfer_zone_flow', {
                    from: dash(ev.fromZoneLabel),
                    to: dash(ev.toZoneLabel)
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
