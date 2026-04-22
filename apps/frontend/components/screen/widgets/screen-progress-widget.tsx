'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Ticket } from '@/lib/api';

/** Approximate position in the waiting line for the first virtual ticket. */
export function ScreenProgressBarWidget({ ticket }: { ticket: Ticket | null }) {
  const t = useTranslations('screen');
  const { pos, total } = useMemo(() => {
    const qp = ticket?.queuePosition;
    if (qp == null || !ticket) return { pos: 0, total: 0 };
    return { pos: Math.max(1, qp), total: Math.max(qp, 1) };
  }, [ticket]);
  if (!ticket || pos <= 0) return null;
  const pct = Math.min(100, (1 - (pos - 1) / Math.max(total, pos)) * 100);
  return (
    <div className='bg-card/80 w-full max-w-md space-y-1 rounded-xl border p-3'>
      <div className='text-muted-foreground text-xs font-medium'>
        {t('progress.approx', { default: 'Your position' })} — #
        {ticket.queueNumber}
      </div>
      <div className='bg-muted h-3 w-full overflow-hidden rounded-full'>
        <div
          className='from-primary to-primary/70 h-3 rounded-full bg-gradient-to-r transition-all duration-700'
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
