'use client';

import { Button } from '@/components/ui/button';
import type { Ticket, Service } from '@/lib/api';
import { useTicketTimer } from '@/lib/ticket-timer';
import { Info } from 'lucide-react';

export function SupervisorTicketListItem({
  ticket,
  onShowDetails,
  t
}: {
  ticket: Ticket & { service?: Service };
  onShowDetails: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { background, formatTime, elapsed } = useTicketTimer(
    ticket.createdAt || undefined,
    ticket.maxWaitingTime
  );

  return (
    <div
      className='hover:bg-accent relative flex items-center justify-between overflow-hidden rounded-lg border p-3'
      style={{ background: background || undefined }}
    >
      <div className='relative z-10 flex-1'>
        <div className='font-semibold'>{ticket.queueNumber}</div>
        <div className='text-muted-foreground text-sm'>
          {ticket.service?.nameRu || ticket.service?.name}
          {ticket.preRegistration && (
            <div className='mt-1 flex items-center gap-2'>
              <span className='rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200'>
                {t('pre_registration.badge', { defaultValue: 'PRE' })}
              </span>
              <span className='text-xs font-medium text-blue-800 dark:text-blue-200'>
                {ticket.preRegistration.time}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className='relative z-10 flex items-center gap-2'>
        <div className='text-muted-foreground text-right text-sm'>
          <div>{formatTime(elapsed)}</div>
          {ticket.maxWaitingTime && (
            <div className='text-xs opacity-70'>
              Max: {formatTime(ticket.maxWaitingTime)}
            </div>
          )}
        </div>
        {ticket.preRegistration && (
          <Button
            size='sm'
            variant='ghost'
            className='h-8 w-8 p-0'
            onClick={(e) => {
              e.stopPropagation();
              onShowDetails();
            }}
          >
            <Info className='h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  );
}
