'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Ticket } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTicketTimer } from '@/lib/ticket-timer';
import { StaffServiceScopeSelector } from '@/components/staff/StaffServiceScopeSelector';
import { StaffCreateTicketModal } from '@/components/staff/StaffCreateTicketModal';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Info, ListChecks, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffQueuePanelProps {
  t: TFn;
  unitId: string;
  /** When true, picking tickets and creating tickets from the panel are blocked. */
  counterOnBreak?: boolean;
  waitingTickets: Ticket[];
  /** When true, list shows all waiting tickets in the unit; false = only tickets for services selected in scope modal. */
  showAllTicketsInQueue: boolean;
  onShowAllTicketsInQueueChange: (value: boolean) => void;
  serviceNames: Record<string, string>;
  /** Leaf services in scope — for “create ticket” menu */
  leafServicesForCreate: { id: string; label: string }[];
  createTicketPending: boolean;
  onCreateTicket: (input: {
    serviceId: string;
    clientId?: string;
  }) => Promise<void>;
  scopeLeaves: { id: string; label: string }[];
  selectedScopeIds: string[];
  onScopeChange: (ids: string[]) => void;
  pickPending: boolean;
  inProgressTicketId: string | null;
  setInProgressTicketId: (id: string | null) => void;
  currentTicket: Ticket | undefined;
  onPickTicket: (ticket: Ticket) => Promise<void>;
  onShowDetails: (ticket: Ticket) => void;
}

function visitorDisplayName(ticket: Ticket, t: TFn): string {
  const c = ticket.client;
  if (!c) return t('queue.no_name');
  if (c.isAnonymous) return t('current.anonymous_visitor');
  const name = [c.firstName, c.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');
  return name || t('current.unknown_visitor');
}

export function StaffQueuePanel({
  t,
  unitId,
  counterOnBreak = false,
  waitingTickets,
  showAllTicketsInQueue,
  onShowAllTicketsInQueueChange,
  serviceNames,
  leafServicesForCreate,
  createTicketPending,
  onCreateTicket,
  scopeLeaves,
  selectedScopeIds,
  onScopeChange,
  pickPending,
  inProgressTicketId,
  setInProgressTicketId,
  currentTicket,
  onPickTicket,
  onShowDetails
}: StaffQueuePanelProps) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [createTicketModalKey, setCreateTicketModalKey] = useState(0);

  const sortedWaiting = useMemo(() => {
    return [...waitingTickets].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [waitingTickets]);

  return (
    <>
      <Card className='border-border/70 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-hidden'>
        <CardHeader className='border-border/50 space-y-1.5 border-b py-2'>
          <div className='flex items-start justify-between gap-2'>
            <div className='min-w-0 flex-1'>
              <CardTitle className='text-sm leading-tight font-semibold'>
                {t('queue.title')}
              </CardTitle>
              <CardDescription className='text-[11px] leading-snug'>
                {t('queue.description')}
              </CardDescription>
            </div>
            <div className='flex shrink-0 flex-col items-end gap-1'>
              {scopeLeaves.length > 0 && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1 px-2 text-xs'
                  onClick={() => setScopeOpen(true)}
                >
                  <ListChecks className='h-3.5 w-3.5' />
                  {t('scope.configure')}
                </Button>
              )}
              {leafServicesForCreate.length > 0 && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 gap-1 px-2 text-xs'
                  disabled={counterOnBreak || createTicketPending}
                  onClick={() => {
                    setCreateTicketModalKey((k) => k + 1);
                    setCreateTicketOpen(true);
                  }}
                >
                  <Plus className='h-3.5 w-3.5' />
                  {t('queue.create_ticket_menu')}
                </Button>
              )}
            </div>
          </div>
          <p className='text-muted-foreground text-[10px] leading-tight'>
            {t('queue.sorted_by_wait')}
          </p>
          <div className='border-border/40 bg-muted/10 flex flex-col gap-1 rounded-md border px-2 py-1.5'>
            <div className='flex items-center justify-between gap-2'>
              <Label
                htmlFor='staff-queue-show-all'
                className='text-foreground cursor-pointer text-[11px] leading-snug font-normal'
              >
                {t('queue.list_show_all')}
              </Label>
              <Switch
                id='staff-queue-show-all'
                checked={showAllTicketsInQueue}
                onCheckedChange={onShowAllTicketsInQueueChange}
              />
            </div>
            <p className='text-muted-foreground text-[10px] leading-tight'>
              {showAllTicketsInQueue
                ? t('queue.list_show_all_hint')
                : t('queue.list_scoped_hint')}
            </p>
          </div>
        </CardHeader>
        <CardContent className='max-h-[min(70vh,32rem)] overflow-y-auto pt-2 lg:max-h-[calc(100vh-10rem)]'>
          <div className='space-y-1.5'>
            {sortedWaiting.length > 0 ? (
              sortedWaiting.map((ticket) => (
                <StaffQueueTicketRow
                  key={ticket.id}
                  ticket={ticket}
                  serviceLabel={
                    serviceNames[ticket.serviceId] ||
                    ticket.serviceId ||
                    t('queue.uncategorized')
                  }
                  visitorName={visitorDisplayName(ticket, t)}
                  onCall={async () => {
                    setInProgressTicketId(ticket.id);
                    try {
                      await onPickTicket(ticket);
                    } catch (e) {
                      logger.error('Failed to pick ticket from staff queue', {
                        ticketId: ticket.id,
                        queueNumber: ticket.queueNumber,
                        serviceId: ticket.serviceId,
                        error: e
                      });
                    } finally {
                      setInProgressTicketId(null);
                    }
                  }}
                  disabled={
                    counterOnBreak ||
                    pickPending ||
                    Boolean(inProgressTicketId) ||
                    !!currentTicket
                  }
                  t={t}
                  onShowDetails={() => onShowDetails(ticket)}
                />
              ))
            ) : (
              <div className='text-muted-foreground py-6 text-center text-sm'>
                {t('queue.noTickets')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <StaffCreateTicketModal
        key={createTicketModalKey}
        open={createTicketOpen}
        onOpenChange={setCreateTicketOpen}
        unitId={unitId}
        leaves={leafServicesForCreate}
        isPending={createTicketPending}
        t={t}
        onCreate={async (input) => {
          await onCreateTicket(input);
          setCreateTicketOpen(false);
        }}
      />

      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className='max-h-[85vh] max-w-md overflow-hidden sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('scope.modal_title')}</DialogTitle>
            <DialogDescription>{t('scope.hint')}</DialogDescription>
          </DialogHeader>
          <StaffServiceScopeSelector
            t={t}
            leaves={scopeLeaves}
            selectedIds={selectedScopeIds}
            onChange={onScopeChange}
            variant='dialog'
          />
          <DialogFooter>
            <Button type='button' onClick={() => setScopeOpen(false)}>
              {t('scope.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StaffQueueTicketRow({
  ticket,
  serviceLabel,
  visitorName,
  onCall,
  disabled,
  t,
  onShowDetails
}: {
  ticket: Ticket;
  serviceLabel: string;
  visitorName: string;
  onCall: () => void;
  disabled: boolean;
  t: TFn;
  onShowDetails: () => void;
}) {
  const { background, formatTime, elapsed, isOverdue, isWarning } =
    useTicketTimer(ticket.createdAt || undefined, ticket.maxWaitingTime);
  const hasMaxBudget =
    ticket.maxWaitingTime != null && ticket.maxWaitingTime > 0;
  const preRegistrationDetailsLabel = t('pre_registration.details_title', {
    defaultValue: 'Pre-registration Details'
  });

  return (
    <div
      className={cn(
        'border-border/60 relative flex flex-col gap-1.5 overflow-hidden rounded-md border p-2 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2',
        isOverdue && 'border-l-4 border-l-red-500',
        !isOverdue && isWarning && 'border-l-4 border-l-amber-500',
        !hasMaxBudget && 'bg-muted/15'
      )}
      style={background ? { background } : undefined}
    >
      <div className='relative z-10 min-w-0 flex-1 space-y-0.5'>
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0'>
          <span className='font-mono text-base font-bold tabular-nums'>
            {ticket.queueNumber}
          </span>
          {ticket.preRegistration && (
            <>
              <span className='rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold text-blue-800'>
                {t('pre_registration.badge', { defaultValue: 'PRE' })}
              </span>
              <span className='text-[11px] font-medium text-blue-800'>
                {ticket.preRegistration.time}
              </span>
            </>
          )}
        </div>
        <p className='text-foreground/90 truncate text-xs font-medium'>
          {visitorName}
        </p>
        <p className='text-muted-foreground truncate text-[11px] leading-snug'>
          {serviceLabel}
        </p>
      </div>
      <div className='relative z-10 flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end'>
        <div className='text-right'>
          <div className='text-muted-foreground text-[9px] font-semibold tracking-wide uppercase'>
            {t('queue.waiting')}
          </div>
          <div
            className={cn(
              'font-mono text-lg font-bold tabular-nums',
              isOverdue && 'text-red-700 dark:text-red-400',
              !isOverdue && isWarning && 'text-amber-700 dark:text-amber-400'
            )}
          >
            {formatTime(elapsed)}
          </div>
          {hasMaxBudget && (
            <div className='text-muted-foreground text-[10px]'>
              {t('queue.max_label')}:{' '}
              {formatTime(ticket.maxWaitingTime as number)}
            </div>
          )}
        </div>
        <div className='flex items-center gap-1'>
          {ticket.preRegistration && (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='h-8 w-8 p-0'
              aria-label={preRegistrationDetailsLabel}
              title={preRegistrationDetailsLabel}
              onClick={(e) => {
                e.stopPropagation();
                onShowDetails();
              }}
            >
              <Info className='h-3.5 w-3.5' aria-hidden />
            </Button>
          )}
          <Button
            size='sm'
            className='h-8 rounded-md px-3 text-xs font-semibold'
            onClick={onCall}
            disabled={disabled}
          >
            {t('actions.call')}
          </Button>
        </div>
      </div>
    </div>
  );
}
