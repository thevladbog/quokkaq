'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Ticket, Service } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { isTicketOverWait } from './supervisor-queue-utils';

function formatClock(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function SupervisorTimelineView({
  queue,
  queueLoading
}: {
  queue: (Ticket & { service?: Service })[] | undefined;
  queueLoading: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const list = queue ?? [];
  const sorted = [...list].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('timelineTitle')}</CardTitle>
        <CardDescription>{t('timelineDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {queueLoading ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='h-10 w-10 animate-spin' />
          </div>
        ) : sorted.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {t('noTicketsInQueue')}
          </p>
        ) : (
          <ul className='border-border relative space-y-0 border-l-2 pl-6'>
            {sorted.map((ticket) => (
              <li key={ticket.id} className='pb-8 last:pb-0'>
                <span
                  className='bg-background border-border absolute top-1.5 -left-[9px] h-4 w-4 rounded-full border-2'
                  aria-hidden
                />
                <div className='flex flex-wrap items-baseline gap-2'>
                  <span className='text-muted-foreground text-xs font-medium tabular-nums'>
                    {formatClock(ticket.createdAt)}
                  </span>
                  <span className='text-base font-semibold'>
                    {ticket.queueNumber}
                  </span>
                  {ticket.preRegistration ? (
                    <Badge variant='outline'>{t('statusPriority')}</Badge>
                  ) : isTicketOverWait(ticket) ? (
                    <Badge variant='destructive'>{t('statusOver')}</Badge>
                  ) : (
                    <Badge variant='secondary'>{t('statusWaiting')}</Badge>
                  )}
                </div>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {ticket.service?.nameRu || ticket.service?.name || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
