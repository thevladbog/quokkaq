'use client';

import { useTranslations } from 'next-intl';
import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';
import { cn } from '@/lib/utils';

function dash(v: string | undefined) {
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
          const hasCounter = !!(ev.fromCounterName || ev.toCounterName);
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
                  from: dash(ev.fromServiceName),
                  to: dash(ev.toServiceName)
                })}
              </div>
              {hasCounter ? (
                <div>
                  {t('visitor_context.transfer_counter_flow', {
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
