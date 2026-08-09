'use client';

import { useTranslations } from 'next-intl';
import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';
import { cn } from '@/lib/utils';
import {
  getTransferDisplayLines,
  localizedTransferServiceName
} from '@/lib/visit-transfer-display';

function dash(v: string | null | undefined) {
  const s = (v ?? '').trim();
  return s || '—';
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
          const displayLines = getTransferDisplayLines(ev, locale);
          const counterLine = displayLines.find(
            (line) => line.kind === 'counter'
          );
          const zoneLine = displayLines.find((line) => line.kind === 'zone');
          const zoneTransferToQueue =
            ev.transferKind === 'zone' &&
            !!counterLine?.from &&
            !counterLine.to;
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
              {counterLine ? (
                <div>
                  {zoneTransferToQueue
                    ? t('visitor_context.transfer_counter_to_zone_queue', {
                        from: counterLine.from
                      })
                    : t('visitor_context.transfer_counter_flow', {
                        from: dash(counterLine.from),
                        to: dash(counterLine.to)
                      })}
                </div>
              ) : null}
              {zoneLine ? (
                <div>
                  {t('visitor_context.transfer_zone_flow', {
                    from: dash(zoneLine.from),
                    to: dash(zoneLine.to)
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
