'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Ticket, Service } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  countOverWaitTickets,
  isTicketOverWait
} from './supervisor-queue-utils';
import { useTicketTimer } from '@/lib/ticket-timer';

function MiniWaitCell({ ticket }: { ticket: Ticket }) {
  const { formatTime, elapsed, isOverdue } = useTicketTimer(
    ticket.createdAt || undefined,
    ticket.maxWaitingTime
  );
  return (
    <span className={isOverdue ? 'text-destructive font-medium' : ''}>
      {formatTime(elapsed)}
    </span>
  );
}

export function SupervisorQueueStrip({
  queue,
  queueLoading
}: {
  queue: (Ticket & { service?: Service })[] | undefined;
  queueLoading: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const list = queue ?? [];
  const overWait = countOverWaitTickets(list);
  const preview = list.slice(0, 8);

  return (
    <Card>
      <CardHeader className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>{t('queueOverviewTitle')}</CardTitle>
          <CardDescription>{t('queueOverviewDescription')}</CardDescription>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Badge variant='secondary' className='tabular-nums'>
            {t('inLine')}: {list.length}
          </Badge>
          {overWait > 0 ? (
            <Badge variant='destructive' className='tabular-nums'>
              {t('overWait')}: {overWait}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {queueLoading ? (
          <div className='flex justify-center py-8'>
            <Loader2 className='h-8 w-8 animate-spin' />
          </div>
        ) : preview.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            {t('noTicketsInQueue')}
          </p>
        ) : (
          <div className='max-h-[280px] overflow-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colTicket')}</TableHead>
                  <TableHead>{t('colService')}</TableHead>
                  <TableHead>{t('colWait')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className='font-medium'>
                      {ticket.queueNumber}
                    </TableCell>
                    <TableCell className='text-muted-foreground max-w-[140px] truncate text-sm'>
                      {ticket.service?.nameRu || ticket.service?.name || '—'}
                    </TableCell>
                    <TableCell>
                      <MiniWaitCell ticket={ticket} />
                    </TableCell>
                    <TableCell>
                      {ticket.preRegistration ? (
                        <Badge variant='outline'>{t('statusPriority')}</Badge>
                      ) : isTicketOverWait(ticket) ? (
                        <Badge variant='destructive'>{t('statusOver')}</Badge>
                      ) : (
                        <Badge variant='secondary'>{t('statusWaiting')}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
