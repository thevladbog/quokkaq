'use client';

import { useState, useEffect, useMemo, use } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  useTickets,
  useCompleteTicket,
  useNoShowTicket,
  useCallNextTicket,
  useTransferTicket,
  useCounters,
  usePickTicket,
  useConfirmArrivalTicket,
  useUnitServices
} from '@/lib/hooks';
import { countersApi, unitsApi, Ticket, type Service } from '@/lib/api';

/** Stable empty refs so React Query “no data yet” does not allocate a new [] every render (avoids effect loops on [data]). */
const EMPTY_TICKET_LIST: Ticket[] = [];
const EMPTY_SERVICE_LIST: Service[] = [];
import { socketClient } from '@/lib/socket';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PreRegistrationDetailsModal } from '@/components/staff/PreRegistrationDetailsModal';
import { StaffCurrentTicketHero } from '@/components/staff/StaffCurrentTicketHero';
import { StaffIdleWorkstationHero } from '@/components/staff/StaffIdleWorkstationHero';
import { StaffWorkstationActionPanel } from '@/components/staff/StaffWorkstationActionPanel';
import { StaffVisitorContextPanel } from '@/components/staff/StaffVisitorContextPanel';
import { StaffQueuePanel } from '@/components/staff/StaffQueuePanel';
import { useSyncActiveUnit } from '@/contexts/ActiveUnitContext';
import { cn } from '@/lib/utils';
import { formatWaitDurationSeconds } from '@/components/supervisor/supervisor-queue-utils';
import { useLiveElapsedSecondsSince } from '@/lib/use-live-elapsed-since';

interface StaffWorkspacePageProps {
  params: Promise<{
    unitId: string;
    counterId: string;
    locale: string;
  }>;
}

export default function StaffWorkspacePage({
  params
}: StaffWorkspacePageProps) {
  const { unitId, counterId, locale } = use(params);
  const t = useTranslations('staff');
  const router = useRouter();
  useSyncActiveUnit(unitId);
  const [inProgressTicketId, setInProgressTicketId] = useState<string | null>(
    null
  );
  const [detailsTicket, setDetailsTicket] = useState<Ticket | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const openDetails = (ticket: Ticket) => {
    setDetailsTicket(ticket);
    setIsDetailsOpen(true);
  };

  // Fetch Unit Info for display
  const { data: unit } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: () => unitsApi.getById(unitId)
  });

  // Fetch Counter Info for display
  const { data: counters } = useQuery({
    queryKey: ['counters', unitId],
    queryFn: () => countersApi.getByUnitId(unitId)
  });
  const myCounter = useMemo(
    () => counters?.find((c) => c.id === counterId),
    [counters, counterId]
  );
  const counterName = myCounter?.name || counterId;
  const workstationOnBreak = myCounter?.onBreak ?? false;
  const breakStartedAt = myCounter?.breakStartedAt ?? null;
  const breakElapsedSec = useLiveElapsedSecondsSince(
    workstationOnBreak ? breakStartedAt : null
  );

  // Ticket Hooks
  const {
    data: ticketsData,
    error,
    refetch
  } = useTickets(unitId, {
    enabled: !!unitId
  });
  const tickets = ticketsData ?? EMPTY_TICKET_LIST;
  const completeMutation = useCompleteTicket();
  const noShowMutation = useNoShowTicket();
  const callNextMutation = useCallNextTicket();
  const transferMutation = useTransferTicket();
  const pickMutation = usePickTicket();
  const confirmArrivalMutation = useConfirmArrivalTicket();

  const createTicketMutation = useMutation({
    mutationFn: (vars: { serviceId: string; clientId?: string }) =>
      unitsApi.createTicket(unitId, vars),
    onSuccess: () => {
      toast.success(t('messages.ticketCreated'));
      refetch();
    },
    onError: () => {
      toast.error(t('messages.failed', { action: 'create ticket' }));
    }
  });

  const queryClient = useQueryClient();

  // Logout / Release Mutation
  const releaseMutation = useMutation({
    mutationFn: () => countersApi.release(counterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters'] });
      router.push('/staff');
    },
    onError: (error: Error) => {
      console.error('Failed to release counter:', error);
      toast.error(t('logout_failed', { error: error.message }));
    }
  });

  const startBreakMutation = useMutation({
    mutationFn: () => countersApi.startBreak(counterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters', unitId] });
      queryClient.invalidateQueries({ queryKey: ['counters'] });
      queryClient.invalidateQueries({ queryKey: ['shift-counters'] });
      toast.success(t('workstation.break_started'));
      refetch();
    },
    onError: (error: Error) => {
      const msg = (error.message || '').toLowerCase();
      toast.error(t('workstation.break_error'), {
        description:
          msg.includes('active') || msg.includes('ticket')
            ? t('workstation.break_needs_no_ticket')
            : error.message
      });
    }
  });

  const endBreakMutation = useMutation({
    mutationFn: () => countersApi.endBreak(counterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counters', unitId] });
      queryClient.invalidateQueries({ queryKey: ['counters'] });
      queryClient.invalidateQueries({ queryKey: ['shift-counters'] });
      toast.success(t('workstation.break_ended'));
      refetch();
    },
    onError: (error: Error) => {
      toast.error(t('workstation.break_error'), {
        description: error.message
      });
    }
  });

  const currentTicket = tickets.find(
    (ticket) => ticket.status === 'called' || ticket.status === 'in_service'
  );
  const waitingTickets = tickets.filter(
    (ticket) => ticket.status === 'waiting'
  );

  const { data: servicesData } = useUnitServices(unitId);
  const services = servicesData ?? EMPTY_SERVICE_LIST;

  const leafServiceIds = useMemo(
    () => services.filter((s) => s.isLeaf).map((s) => s.id),
    [services]
  );

  const scopeStorageKey = `staff-service-scope:${unitId}:${counterId}`;
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[] | null>(
    null
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!leafServiceIds.length) {
      setSelectedServiceIds([]);
      return;
    }
    let next = [...leafServiceIds];
    try {
      const raw = localStorage.getItem(scopeStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (id): id is string =>
              typeof id === 'string' && leafServiceIds.includes(id)
          );
          if (valid.length > 0) next = valid;
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setSelectedServiceIds(next);
  }, [unitId, counterId, scopeStorageKey, leafServiceIds]);

  useEffect(() => {
    if (selectedServiceIds === null || typeof window === 'undefined') return;
    localStorage.setItem(scopeStorageKey, JSON.stringify(selectedServiceIds));
  }, [scopeStorageKey, selectedServiceIds]);

  const scopeForFilter =
    selectedServiceIds === null ? leafServiceIds : selectedServiceIds;

  const scopedWaitingTickets = useMemo(() => {
    if (!leafServiceIds.length) return waitingTickets;
    if (!scopeForFilter.length) return [];
    return waitingTickets.filter((t) => scopeForFilter.includes(t.serviceId));
  }, [waitingTickets, scopeForFilter, leafServiceIds]);

  /** List-only: show whole unit queue vs only tickets for services selected in «Услуги». Call next always uses scope. */
  const queueViewAllKey = `staff-queue-show-all:${unitId}:${counterId}`;
  const [showAllQueueTickets, setShowAllQueueTickets] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setShowAllQueueTickets(localStorage.getItem(queueViewAllKey) === '1');
    } catch {
      /* ignore */
    }
  }, [unitId, counterId, queueViewAllKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(queueViewAllKey, showAllQueueTickets ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [queueViewAllKey, showAllQueueTickets]);

  const queueDisplayTickets = useMemo(
    () => (showAllQueueTickets ? waitingTickets : scopedWaitingTickets),
    [showAllQueueTickets, waitingTickets, scopedWaitingTickets]
  );

  // WebSocket Connection
  useEffect(() => {
    if (!unitId) return;

    socketClient.connect(unitId);

    const handleTicketUpdate = () => {
      refetch();
    };

    socketClient.onTicketCreated(handleTicketUpdate);
    socketClient.onTicketUpdated(handleTicketUpdate);
    socketClient.onTicketCalled(handleTicketUpdate);

    return () => {
      socketClient.off('ticket.created', handleTicketUpdate);
      socketClient.off('ticket.updated', handleTicketUpdate);
      socketClient.off('ticket.called', handleTicketUpdate);
      socketClient.disconnect();
    };
  }, [unitId, refetch]);

  const leafServicesForScope = useMemo(() => {
    return leafServiceIds
      .map((id) => {
        const s = services.find((x) => x.id === id);
        if (!s) return null;
        const label =
          locale === 'ru'
            ? s.nameRu || s.nameEn || s.name
            : s.nameEn || s.nameRu || s.name;
        return { id, label };
      })
      .filter(Boolean) as { id: string; label: string }[];
  }, [services, leafServiceIds, locale]);

  // Service Names Cache - derived from services list, with full hierarchical path
  const serviceNames = useMemo(() => {
    const names: Record<string, string> = {};

    // Helper to get localized name for a service
    const getLocalizedName = (service: (typeof services)[0]) => {
      return locale === 'ru'
        ? service.nameRu || service.nameEn || service.name
        : service.nameEn || service.nameRu || service.name;
    };

    // Helper to build full path: Parent -> Parent -> Service
    const buildServicePath = (
      serviceId: string,
      visited = new Set<string>()
    ): string => {
      // Prevent infinite loops
      if (visited.has(serviceId)) return '';
      visited.add(serviceId);

      const service = services.find((s) => s.id === serviceId);
      if (!service) return serviceId;

      const currentName = getLocalizedName(service);

      // If no parent, return just the current name
      if (!service.parentId) {
        return currentName;
      }

      // Build parent path recursively
      const parentPath = buildServicePath(service.parentId, visited);

      // Combine parent path with current name
      return parentPath ? `${parentPath} → ${currentName}` : currentName;
    };

    // Build names for all services
    services.forEach((s) => {
      names[s.id] = buildServicePath(s.id);
    });

    return names;
  }, [services, locale]);

  // Actions
  const handleCallNext = async () => {
    try {
      const idsForCall =
        selectedServiceIds === null ? leafServiceIds : selectedServiceIds;
      let serviceIds: string[] | undefined;
      if (
        leafServiceIds.length > 0 &&
        (idsForCall.length !== leafServiceIds.length ||
          !leafServiceIds.every((id) => idsForCall.includes(id)))
      ) {
        serviceIds = idsForCall;
      }
      const result = await callNextMutation.mutateAsync({
        counterId,
        serviceIds
      });
      if (!result || !result.ok) {
        toast.error(
          result?.message || t('messages.failed', { action: 'call' })
        );
      } else {
        const number = result.ticket?.queueNumber || 'NEXT';
        toast.success(t('messages.called', { number }));
      }
      await refetch();
    } catch (error) {
      console.error('Failed to call next:', error);
      toast.error(t('messages.failed', { action: 'call' }));
    }
  };

  const handleConfirmArrival = async () => {
    if (!currentTicket) return;
    try {
      await confirmArrivalMutation.mutateAsync(currentTicket.id);
      toast.success(
        t('messages.serviceStarted', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      console.error('Failed to start service:', error);
      toast.error(t('messages.failed', { action: 'start service' }));
    }
  };

  const handleComplete = async () => {
    if (!currentTicket) return;
    try {
      await completeMutation.mutateAsync(currentTicket.id);
      toast.success(
        t('messages.completed', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      console.error('Failed to complete ticket:', error);
      toast.error(t('messages.failed', { action: 'complete' }));
    }
  };

  const handleNoShow = async () => {
    if (!currentTicket) return;
    try {
      await noShowMutation.mutateAsync(currentTicket.id);
      toast.success(
        t('messages.noShow', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      console.error('Failed to mark no-show:', error);
      toast.error(t('messages.failed', { action: 'mark no-show' }));
    }
  };

  // Transfer Dialog State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const { data: countersForTransfer = [] } = useCounters(unitId || '');

  const handleTransfer = async () => {
    if (!currentTicket || !transferTargetId) return;
    try {
      await transferMutation.mutateAsync({
        id: currentTicket.id,
        toCounterId: transferTargetId
      });
      toast.success(
        t('messages.transferred', { number: currentTicket.queueNumber })
      );
      setIsTransferOpen(false);
      setTransferTargetId('');
      await refetch();
    } catch (error) {
      console.error('Failed to transfer ticket:', error);
      toast.error(t('messages.failed', { action: 'transfer' }));
    }
  };

  if (error) {
    return (
      <div className='container mx-auto p-4'>
        {t('error_loading', { error: (error as Error).message })}
      </div>
    );
  }

  return (
    <div className='container mx-auto max-w-[88rem] flex-1 px-3 py-3 pb-8 sm:px-4'>
      <div className='border-border/60 bg-background/80 rounded-xl border p-4 shadow-sm sm:p-5'>
        <header className='border-border/50 mb-4 flex flex-col gap-3 border-b pb-4 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:pb-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className='from-primary to-primary/70 hidden h-10 w-1 shrink-0 rounded-full bg-gradient-to-b sm:block' />
            <div className='min-w-0'>
              <p className='text-muted-foreground truncate text-[11px] font-medium tracking-wide uppercase'>
                {unit?.name ?? '—'}
              </p>
              <h1 className='truncate text-xl font-bold tracking-tight sm:text-2xl'>
                {counterName}
              </h1>
            </div>
          </div>
          <div className='flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-center'>
            {workstationOnBreak ? (
              <Button
                type='button'
                size='sm'
                className='h-9'
                onClick={() => endBreakMutation.mutate()}
                disabled={
                  endBreakMutation.isPending || releaseMutation.isPending
                }
              >
                {t('workstation.resume')}
              </Button>
            ) : (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-9'
                onClick={() => startBreakMutation.mutate()}
                disabled={
                  startBreakMutation.isPending ||
                  releaseMutation.isPending ||
                  Boolean(currentTicket)
                }
              >
                {t('workstation.break')}
              </Button>
            )}
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-9'
              onClick={() => releaseMutation.mutate()}
              disabled={releaseMutation.isPending}
            >
              <LogOut className='mr-2 h-3.5 w-3.5' />
              {t('logout')}
            </Button>
          </div>
        </header>

        {/* Transfer Dialog */}
        <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('actions.transfer')}</DialogTitle>
            </DialogHeader>
            <div className='py-4'>
              <Label className='mb-2 block'>{t('select_counter_label')}</Label>
              <div className='grid gap-2'>
                {countersForTransfer
                  .filter((c) => c.id !== counterId)
                  .map((counter) => (
                    <Button
                      key={counter.id}
                      variant={
                        transferTargetId === counter.id ? 'default' : 'outline'
                      }
                      className='justify-start'
                      onClick={() => setTransferTargetId(counter.id)}
                    >
                      {counter.name}
                    </Button>
                  ))}
                {countersForTransfer.length <= 1 && (
                  <p className='text-muted-foreground text-sm'>
                    {t('no_other_counters')}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setIsTransferOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleTransfer}
                disabled={!transferTargetId || transferMutation.isPending}
              >
                {t('transfer_button')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PreRegistrationDetailsModal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          ticket={detailsTicket}
        />

        <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem] xl:grid-cols-[minmax(0,1fr)_19rem]'>
          <div className='min-w-0 space-y-4'>
            <Card className='border-border/70 gap-0 overflow-hidden py-0 shadow-sm'>
              <CardHeader className='border-border/50 space-y-0.5 border-b px-4 py-1.5 [.border-b]:pb-1.5'>
                <CardTitle className='text-sm leading-tight font-semibold'>
                  {t('current.title')}
                </CardTitle>
                <CardDescription className='text-[11px] leading-snug'>
                  {t('current.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-2.5 px-4 pt-3 pb-4'>
                {workstationOnBreak ? (
                  <div
                    className={cn(
                      'flex flex-col items-center rounded-xl border border-dashed px-4 py-8 text-center',
                      'border-amber-400/50 bg-amber-50/40 dark:border-amber-700/50 dark:bg-amber-950/25'
                    )}
                  >
                    <Coffee
                      className='h-12 w-12 text-amber-900/75 dark:text-amber-200/85'
                      strokeWidth={1.5}
                    />
                    <p className='text-foreground mt-4 text-lg font-semibold'>
                      {t('current.break_title')}
                    </p>
                    <p className='text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed'>
                      {t('current.break_subtitle')}
                    </p>
                    <p className='text-foreground mt-4 font-mono text-base font-semibold tabular-nums'>
                      {t('current.break_duration')}:{' '}
                      {formatWaitDurationSeconds(breakElapsedSec)}
                    </p>
                    <Button
                      type='button'
                      className='mt-5'
                      size='sm'
                      onClick={() => endBreakMutation.mutate()}
                      disabled={endBreakMutation.isPending}
                    >
                      {t('workstation.resume')}
                    </Button>
                  </div>
                ) : currentTicket ? (
                  <StaffCurrentTicketHero
                    unitId={unitId}
                    ticket={currentTicket}
                    t={t}
                    onShowDetails={() => openDetails(currentTicket)}
                  />
                ) : (
                  <StaffIdleWorkstationHero
                    waitingCount={scopedWaitingTickets.length}
                    t={t}
                  />
                )}
                {!workstationOnBreak && (
                  <StaffWorkstationActionPanel
                    t={t}
                    currentTicket={currentTicket}
                    waitingCount={scopedWaitingTickets.length}
                    callNextPending={callNextMutation.isPending}
                    confirmArrivalPending={confirmArrivalMutation.isPending}
                    completePending={completeMutation.isPending}
                    transferPending={transferMutation.isPending}
                    noShowPending={noShowMutation.isPending}
                    onCallNext={handleCallNext}
                    onConfirmArrival={handleConfirmArrival}
                    onComplete={handleComplete}
                    onOpenTransfer={() => setIsTransferOpen(true)}
                    onNoShow={handleNoShow}
                  />
                )}
                {currentTicket && !workstationOnBreak && (
                  <div className='border-border/40 mt-1 border-t pt-3'>
                    <StaffVisitorContextPanel
                      key={currentTicket.id}
                      unitId={unitId}
                      ticket={currentTicket}
                      locale={locale}
                      t={t}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <StaffQueuePanel
            t={t}
            unitId={unitId}
            counterOnBreak={workstationOnBreak}
            waitingTickets={queueDisplayTickets}
            showAllTicketsInQueue={showAllQueueTickets}
            onShowAllTicketsInQueueChange={setShowAllQueueTickets}
            serviceNames={serviceNames}
            leafServicesForCreate={leafServicesForScope}
            createTicketPending={createTicketMutation.isPending}
            onCreateTicket={async (input) => {
              await createTicketMutation.mutateAsync(input);
            }}
            scopeLeaves={leafServicesForScope}
            selectedScopeIds={
              selectedServiceIds === null ? leafServiceIds : selectedServiceIds
            }
            onScopeChange={setSelectedServiceIds}
            pickPending={pickMutation.isPending}
            inProgressTicketId={inProgressTicketId}
            setInProgressTicketId={setInProgressTicketId}
            currentTicket={currentTicket}
            onPickTicket={async (ticket) => {
              await pickMutation.mutateAsync({
                id: ticket.id,
                counterId
              });
              await refetch();
            }}
            onShowDetails={openDetails}
          />
        </div>
      </div>
    </div>
  );
}
