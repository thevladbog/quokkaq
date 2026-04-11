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
import { Button } from '@/components/ui/button';
import type { Ticket, Service } from '@/lib/api';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Info, LogOut } from 'lucide-react';
import {
  formatWaitDurationSeconds,
  isTicketOverWait
} from './supervisor-queue-utils';
import { useTicketTimer } from '@/lib/ticket-timer';
import type { ShiftCounterRow } from './SupervisorWorkstationMonitoring';

function TableWaitCell({ ticket }: { ticket: Ticket }) {
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

export function SupervisorListView({
  queue,
  queueLoading,
  counters,
  countersLoading,
  onShowTicketDetails,
  onForceRelease,
  releasePending
}: {
  queue: (Ticket & { service?: Service })[] | undefined;
  queueLoading: boolean;
  counters: ShiftCounterRow[] | undefined;
  countersLoading: boolean;
  onShowTicketDetails: (ticket: Ticket & { service?: Service }) => void;
  onForceRelease: (counter: ShiftCounterRow) => void;
  releasePending: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const sorted = useMemo(() => {
    const list = queue ?? [];
    return [...list].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [queue]);
  const counterRows = counters ?? [];

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('listQueueTitle')}</CardTitle>
          <CardDescription>{t('listQueueDescription')}</CardDescription>
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
            <div className='max-h-[min(70vh,520px)] overflow-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colTicket')}</TableHead>
                    <TableHead>{t('colService')}</TableHead>
                    <TableHead>{t('colWait')}</TableHead>
                    <TableHead>{t('colMaxWait')}</TableHead>
                    <TableHead>{t('colQueueStatus')}</TableHead>
                    <TableHead className='w-[52px]' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className='font-medium'>
                        {ticket.queueNumber}
                      </TableCell>
                      <TableCell className='text-muted-foreground max-w-[200px] truncate text-sm'>
                        {ticket.service?.nameRu || ticket.service?.name || '—'}
                      </TableCell>
                      <TableCell>
                        <TableWaitCell ticket={ticket} />
                      </TableCell>
                      <TableCell className='text-muted-foreground text-sm'>
                        {ticket.maxWaitingTime
                          ? formatWaitDurationSeconds(ticket.maxWaitingTime)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {ticket.preRegistration ? (
                          <Badge variant='outline'>{t('statusPriority')}</Badge>
                        ) : isTicketOverWait(ticket) ? (
                          <Badge variant='destructive'>{t('statusOver')}</Badge>
                        ) : (
                          <Badge variant='secondary'>
                            {t('statusWaiting')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {ticket.preRegistration ? (
                          <Button
                            type='button'
                            size='icon'
                            variant='ghost'
                            className='h-8 w-8'
                            onClick={() => onShowTicketDetails(ticket)}
                            aria-label={t('detailsAria')}
                          >
                            <Info className='h-4 w-4' />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('listCountersTitle')}</CardTitle>
          <CardDescription>{t('listCountersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {countersLoading ? (
            <div className='flex justify-center py-12'>
              <Loader2 className='h-10 w-10 animate-spin' />
            </div>
          ) : counterRows.length === 0 ? (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              {t('noCounters')}
            </p>
          ) : (
            <div className='max-h-[min(50vh,400px)] overflow-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('colCounter')}</TableHead>
                    <TableHead>{t('colOperator')}</TableHead>
                    <TableHead>{t('colActiveTicket')}</TableHead>
                    <TableHead>{t('colCounterStatus')}</TableHead>
                    <TableHead className='text-right'>
                      {t('colActions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counterRows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className='font-medium'>{c.name}</TableCell>
                      <TableCell className='text-muted-foreground text-sm'>
                        {c.isOccupied
                          ? c.assignedUser?.name || t('unknownOperator')
                          : t('counterFree')}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {c.activeTicket?.queueNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        {c.isOccupied ? (
                          <Badge variant='default'>{t('counterBusy')}</Badge>
                        ) : (
                          <Badge variant='outline'>{t('counterFree')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        {c.isOccupied ? (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            onClick={() => onForceRelease(c)}
                            disabled={releasePending}
                          >
                            <LogOut className='mr-1 h-4 w-4' />
                            {t('forceRelease')}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
