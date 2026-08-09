'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { Ticket, type Service } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTicketTimer } from '@/lib/ticket-timer';
import { StaffServiceScopeSelector } from '@/components/staff/StaffServiceScopeSelector';
import { StaffCreateTicketModal } from '@/components/staff/StaffCreateTicketModal';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  AlertTriangle,
  Info,
  ListChecks,
  Plus,
  SlidersHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getDocumentsDataPreviewString,
  shouldShowUserDataInQueueList
} from '@/lib/ticket-user-data-visibility';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

type TFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export interface StaffQueuePanelProps {
  t: TFn;
  unitId: string;
  /** False when the operator lacks `tickets.user_data.read` for this unit. */
  canReadUserData: boolean;
  /** When true, picking tickets and creating tickets from the panel are blocked. */
  counterOnBreak?: boolean;
  waitingTickets: Ticket[];
  scopedWaitingCount: number;
  queuePending: boolean;
  queueRefreshing: boolean;
  queueError?: Error | null;
  onRetryQueue: () => void;
  /** When true, list shows all waiting tickets in the unit; false = only tickets for services selected in scope modal. */
  showAllTicketsInQueue: boolean;
  onShowAllTicketsInQueueChange: (value: boolean) => void;
  /** When true, waiting list is limited to the same waiting pool as this counter (service zone vs subdivision-wide). */
  onlyMyZone?: boolean;
  onOnlyMyZoneChange?: (value: boolean) => void;
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
  scopeSummary: {
    kind: 'all' | 'single' | 'multiple';
    labels: string[];
    count: number;
  };
  onScopeChange: (ids: string[]) => void;
  pickPending: boolean;
  conflictingActionPending: boolean;
  inProgressTicketId: string | null;
  setInProgressTicketId: (id: string | null) => void;
  currentTicket: Ticket | undefined;
  onPickTicket: (ticket: Ticket) => Promise<void>;
  onShowDetails: (ticket: Ticket) => void;
  services: Service[];
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
  scopedWaitingCount,
  queuePending,
  queueRefreshing,
  queueError,
  onRetryQueue,
  showAllTicketsInQueue,
  onShowAllTicketsInQueueChange,
  onlyMyZone = false,
  onOnlyMyZoneChange,
  serviceNames,
  leafServicesForCreate,
  createTicketPending,
  onCreateTicket,
  scopeLeaves,
  selectedScopeIds,
  scopeSummary,
  onScopeChange,
  pickPending,
  conflictingActionPending,
  inProgressTicketId,
  setInProgressTicketId,
  currentTicket,
  onPickTicket,
  onShowDetails,
  services,
  canReadUserData
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

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services]
  );

  const getServiceForTicket = useCallback(
    (id: string | undefined) => (id ? serviceById.get(id) : undefined),
    [serviceById]
  );

  return (
    <>
      <TooltipProvider>
        <Card className='border-border/70 flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0 shadow-sm'>
          <CardHeader
            data-testid='staff-queue-header'
            className='border-border/50 shrink-0 space-y-1.5 border-b px-4 py-3 sm:px-5'
          >
            <div
              data-testid='staff-queue-header-layout'
              className='flex flex-col gap-3'
            >
              <div className='min-w-0'>
                <CardTitle className='text-sm leading-tight font-semibold'>
                  <h2>{t('queue.title')}</h2>
                </CardTitle>
                <CardDescription className='text-[11px] leading-snug'>
                  {t('queue.description')}
                </CardDescription>
              </div>
              <div className='flex w-full flex-wrap justify-start gap-1.5'>
                {scopeLeaves.length > 0 && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-9 gap-1 px-2 text-xs'
                    onClick={() => setScopeOpen(true)}
                  >
                    <ListChecks className='h-3.5 w-3.5' />
                    {t('scope.configure')}
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='h-9 gap-1 px-2 text-xs'
                    >
                      <SlidersHorizontal className='h-3.5 w-3.5' />
                      {t('queue.filters')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align='end' className='w-72 space-y-3 p-3'>
                    <div className='space-y-1'>
                      <div className='flex min-h-9 items-center justify-between gap-1'>
                        <Label
                          htmlFor='staff-queue-show-all'
                          className='flex min-h-9 flex-1 cursor-pointer items-center text-xs leading-snug'
                        >
                          {t('queue.list_show_all')}
                        </Label>
                        <span className='flex size-9 items-center justify-center'>
                          <Switch
                            id='staff-queue-show-all'
                            checked={showAllTicketsInQueue}
                            onCheckedChange={onShowAllTicketsInQueueChange}
                            className="relative h-5 w-9 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
                          />
                        </span>
                      </div>
                      <p className='text-muted-foreground text-[10px] leading-tight'>
                        {showAllTicketsInQueue
                          ? t('queue.list_show_all_hint')
                          : t('queue.list_scoped_hint')}
                      </p>
                    </div>
                    {onOnlyMyZoneChange ? (
                      <div className='border-border/50 space-y-1 border-t pt-3'>
                        <div className='flex min-h-9 items-center justify-between gap-1'>
                          <Label
                            htmlFor='staff-queue-only-my-zone'
                            className='flex min-h-9 flex-1 cursor-pointer items-center text-xs leading-snug'
                          >
                            {t('queue.only_my_zone')}
                          </Label>
                          <span className='flex size-9 items-center justify-center'>
                            <Switch
                              id='staff-queue-only-my-zone'
                              checked={onlyMyZone}
                              onCheckedChange={onOnlyMyZoneChange}
                              className="relative h-5 w-9 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
                            />
                          </span>
                        </div>
                        <p className='text-muted-foreground text-[10px] leading-tight'>
                          {onlyMyZone
                            ? t('queue.only_my_zone_hint_on')
                            : t('queue.only_my_zone_hint_off')}
                        </p>
                      </div>
                    ) : null}
                  </PopoverContent>
                </Popover>
                {leafServicesForCreate.length > 0 && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-9 gap-1 px-2 text-xs'
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
            {queueRefreshing ? (
              <p
                className='text-muted-foreground text-[10px] leading-tight'
                role='status'
              >
                {t('queue.refreshing')}
              </p>
            ) : null}
          </CardHeader>

          <div className='shrink-0 px-3 pt-2'>
            <StaffServiceScopeSelector
              t={t}
              leaves={scopeLeaves}
              selectedIds={selectedScopeIds}
              onChange={onScopeChange}
              summary={scopeSummary}
              waitingCount={scopedWaitingCount}
            />
          </div>

          {showAllTicketsInQueue ? (
            <Alert role='status' className='mx-3 mt-2 w-auto shrink-0 py-2'>
              <AlertTriangle aria-hidden />
              <AlertDescription className='text-xs'>
                {t('queue.temporary_all_warning')}
              </AlertDescription>
            </Alert>
          ) : null}

          <CardContent
            data-testid='staff-queue-scroll'
            className='min-h-0 flex-1 overflow-y-auto px-3 py-2'
          >
            <div className='space-y-1.5'>
              {queuePending ? (
                <div aria-label={t('queue.loading')} role='status'>
                  <p className='sr-only'>{t('queue.loading')}</p>
                  <div className='space-y-1.5' aria-hidden>
                    {Array.from({ length: 5 }, (_, index) => (
                      <Skeleton
                        key={index}
                        data-testid='staff-queue-skeleton'
                        className='h-20 w-full'
                      />
                    ))}
                  </div>
                </div>
              ) : queueError ? (
                <Alert variant='destructive'>
                  <AlertTriangle aria-hidden />
                  <AlertDescription>
                    <p>
                      {t('queue.load_error', {
                        message: queueError.message
                      })}
                    </p>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='mt-2 h-9'
                      onClick={onRetryQueue}
                    >
                      {t('queue.retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : sortedWaiting.length > 0 ? (
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
                      conflictingActionPending ||
                      pickPending ||
                      Boolean(inProgressTicketId) ||
                      !!currentTicket
                    }
                    t={t}
                    onShowDetails={() => onShowDetails(ticket)}
                    getServiceForTicket={getServiceForTicket}
                    canReadUserData={canReadUserData}
                  />
                ))
              ) : (
                <div className='text-muted-foreground py-6 text-center text-sm'>
                  {scopeLeaves.length > 0 && !showAllTicketsInQueue
                    ? t('queue.empty_scoped', {
                        scope:
                          scopeSummary.kind === 'all'
                            ? t('scope.all_services')
                            : scopeSummary.labels.join(', ')
                      })
                    : t('queue.noTickets')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>

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
  onShowDetails,
  getServiceForTicket,
  canReadUserData
}: {
  ticket: Ticket;
  serviceLabel: string;
  visitorName: string;
  onCall: () => void;
  disabled: boolean;
  t: TFn;
  onShowDetails: () => void;
  getServiceForTicket: (id: string | undefined) => Service | undefined;
  canReadUserData: boolean;
}) {
  const { formatTime, elapsed, isOverdue, isWarning } = useTicketTimer(
    ticket.createdAt || undefined,
    ticket.maxWaitingTime
  );
  const hasMaxBudget =
    ticket.maxWaitingTime != null && ticket.maxWaitingTime > 0;
  const maxWaitingTime = hasMaxBudget ? ticket.maxWaitingTime : undefined;
  const deltaSeconds = maxWaitingTime
    ? isOverdue
      ? elapsed - maxWaitingTime
      : Math.max(0, maxWaitingTime - elapsed)
    : undefined;
  const preRegistrationDetailsLabel = t('pre_registration.details_title', {
    defaultValue: 'Pre-registration Details'
  });
  const userDataDetailsLabel = t('user_data_queue.details_label', {
    defaultValue: 'Kiosk and document data'
  });
  const preReg = Boolean(ticket.preRegistration);
  const userQueuePreview = shouldShowUserDataInQueueList(
    ticket,
    getServiceForTicket,
    canReadUserData
  );
  const showInfo = preReg || userQueuePreview;
  const docPreview = getDocumentsDataPreviewString(
    ticket,
    500,
    canReadUserData,
    {
      ocrFailed: t('ticket_user_data.ocr_failed_preview', {
        defaultValue:
          'Document not read at the kiosk after 2 camera attempts. Verify identity at the counter.'
      }),
      customSkipped: t('ticket_user_data.custom_skipped_preview', {
        defaultValue:
          'Visitor did not provide the requested data on the kiosk. Verify as needed.'
      }),
      idDocumentOcr: t('ticket_user_data.id_document_ocr', {
        defaultValue: 'Document (OCR line)'
      })
    }
  );

  return (
    <div
      data-testid={`staff-queue-ticket-${ticket.id}`}
      className={cn(
        'border-border/60 relative flex flex-col gap-1.5 overflow-hidden rounded-md border p-2 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2',
        hasMaxBudget &&
          !isWarning &&
          !isOverdue &&
          'border-l-border border-l-2',
        hasMaxBudget &&
          isWarning &&
          !isOverdue &&
          'border-l-2 border-l-amber-500',
        hasMaxBudget && isOverdue && 'border-l-2 border-l-red-500',
        !hasMaxBudget && 'bg-muted/15'
      )}
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
            {hasMaxBudget ? t('queue.sla_waiting') : t('queue.waiting')}
          </div>
          <div
            data-testid='staff-queue-timer-value'
            className={cn(
              'font-mono text-lg font-bold tabular-nums',
              isOverdue && 'text-red-700 dark:text-red-400',
              !isOverdue && isWarning && 'text-amber-700 dark:text-amber-400'
            )}
          >
            {formatTime(elapsed)}
            {maxWaitingTime && (
              <span className='text-muted-foreground text-[11px] font-medium'>
                {' '}
                / {formatTime(maxWaitingTime)}
              </span>
            )}
          </div>
          {deltaSeconds != null && (
            <div
              className={cn(
                'text-muted-foreground text-[10px] font-medium tabular-nums',
                isOverdue && 'text-red-700 dark:text-red-400',
                !isOverdue && isWarning && 'text-amber-700 dark:text-amber-400'
              )}
            >
              {t(isOverdue ? 'queue.sla_over_by' : 'queue.sla_remaining', {
                time: formatTime(deltaSeconds)
              })}
            </div>
          )}
        </div>
        <div className='flex items-center gap-1'>
          {showInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  className='size-9 p-0'
                  aria-label={
                    preReg ? preRegistrationDetailsLabel : userDataDetailsLabel
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowDetails();
                  }}
                >
                  <Info className='h-3.5 w-3.5' aria-hidden />
                </Button>
              </TooltipTrigger>
              {userQueuePreview && docPreview ? (
                <TooltipContent
                  side='left'
                  className='max-w-[min(18rem,70vw)]'
                  sideOffset={4}
                >
                  <p className='text-xs break-all'>{docPreview}</p>
                </TooltipContent>
              ) : null}
            </Tooltip>
          )}
          <Button
            size='sm'
            className='h-9 rounded-md px-3 text-xs font-semibold'
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
