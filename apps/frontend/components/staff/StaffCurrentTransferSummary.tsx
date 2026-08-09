'use client';

import type { ClientVisitTransferEvent } from '@quokkaq/shared-types';
import { Button } from '@/components/ui/button';
import {
  formatAppDateTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import type { TFn } from '@/lib/i18n';
import {
  getLatestTransfer,
  getTransferDisplayLines,
  type TransferDisplayLine
} from '@/lib/visit-transfer-display';

export interface StaffCurrentTransferSummaryProps {
  trail: ClientVisitTransferEvent[] | undefined;
  locale: string;
  t: TFn;
  onOpenFullTrail: () => void;
}

function formatLine(
  line: TransferDisplayLine,
  event: ClientVisitTransferEvent,
  t: TFn
): string {
  if (
    line.kind === 'counter' &&
    event.transferKind === 'zone' &&
    line.from &&
    !line.to
  ) {
    return t('visitor_context.transfer_counter_to_zone_queue', {
      from: line.from
    });
  }

  if (!line.from || !line.to) {
    const side = line.from ? 'from' : 'to';
    return t(`visitor_context.transfer_${line.kind}_${side}`, {
      value: line.from || line.to
    });
  }

  if (line.kind === 'service') {
    return t('visitor_context.transfer_service_flow', {
      from: line.from,
      to: line.to
    });
  }

  if (line.kind === 'counter') {
    return t('visitor_context.transfer_counter_flow', {
      from: line.from,
      to: line.to
    });
  }

  return t('visitor_context.transfer_zone_flow', {
    from: line.from,
    to: line.to
  });
}

export function StaffCurrentTransferSummary({
  trail,
  locale,
  t,
  onOpenFullTrail
}: StaffCurrentTransferSummaryProps) {
  const latest = getLatestTransfer(trail);
  if (!latest) return null;

  const lines = getTransferDisplayLines(latest, locale);
  const formattedTime = formatAppDateTime(
    latest.at,
    intlLocaleFromAppLocale(locale)
  );

  return (
    <section className='border-border/60 bg-muted/20 rounded-lg border p-2.5'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='text-foreground text-xs font-semibold'>
            {t('visitor_context.last_transfer')}
          </h3>
          <time
            className='text-muted-foreground mt-0.5 block text-[11px]'
            dateTime={latest.at}
          >
            {t('visitor_context.transferred_at', { time: formattedTime })}
          </time>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-7 shrink-0 px-2 text-xs'
          onClick={onOpenFullTrail}
        >
          {t('visitor_context.transfer_show_all')}
        </Button>
      </div>
      {lines.length > 0 ? (
        <ul className='text-muted-foreground mt-2 space-y-0.5 text-xs'>
          {lines.map((line) => (
            <li key={line.kind}>{formatLine(line, latest, t)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
