'use client';

import { useState, useEffect, useMemo, use, useRef } from 'react';
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
import { countersApi, unitsApi, Ticket } from '@/lib/api';
import { socketClient } from '@/lib/socket';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, ArrowRightLeft, Plus, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTicketTimer } from '@/lib/ticket-timer';
import { PreRegistrationDetailsModal } from '@/components/staff/PreRegistrationDetailsModal';
import { useSyncActiveUnit } from '@/contexts/ActiveUnitContext';

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
  const counterName =
    counters?.find((c) => c.id === counterId)?.name || counterId;

  // Ticket Hooks
  const {
    data: tickets = [],
    error,
    refetch
  } = useTickets(unitId, {
    enabled: !!unitId
  });
  const completeMutation = useCompleteTicket();
  const noShowMutation = useNoShowTicket();
  const callNextMutation = useCallNextTicket();
  const transferMutation = useTransferTicket();
  const pickMutation = usePickTicket();
  const confirmArrivalMutation = useConfirmArrivalTicket();

  const createTicketMutation = useMutation({
    mutationFn: (serviceId: string) =>
      unitsApi.createTicket(unitId, { serviceId }),
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

  const currentTicket = tickets.find(
    (ticket) => ticket.status === 'called' || ticket.status === 'in_service'
  );
  const waitingTickets = tickets.filter(
    (ticket) => ticket.status === 'waiting'
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

  // Fetch Services
  const { data: services = [] } = useUnitServices(unitId);

  // Group waiting tickets
  const groupedWaiting = useMemo(() => {
    const map: Record<string, Ticket[]> = {};

    // Initialize with all leaf services
    services.forEach((service) => {
      if (service.isLeaf) {
        map[service.id] = [];
      }
    });

    // Add tickets to map
    waitingTickets.forEach((ticket) => {
      const key = ticket.serviceId || 'uncategorized';
      if (!map[key]) map[key] = [];
      map[key].push(ticket);
    });

    return map;
  }, [waitingTickets, services]);

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

  // Collapsed groups state with smart auto-expand/collapse logic
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Track previous ticket counts to detect when empty groups become non-empty
  const prevTicketCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    const newOpenState: Record<string, boolean> = {};
    const newTicketCounts: Record<string, number> = {};

    Object.entries(groupedWaiting).forEach(([serviceId, ticketsForService]) => {
      const currentCount = ticketsForService.length;
      const previousCount = prevTicketCounts.current[serviceId] || 0;
      newTicketCounts[serviceId] = currentCount;

      const hasTickets = currentCount > 0;
      const wasEmpty = previousCount === 0;
      const becameNonEmpty = wasEmpty && hasTickets;

      if (!hasTickets) {
        // Always collapse empty groups
        newOpenState[serviceId] = false;
      } else if (becameNonEmpty) {
        // Auto-expand when tickets arrive in previously empty group
        newOpenState[serviceId] = true;
      } else if (serviceId in openGroups) {
        // Preserve user's manual toggle state for non-empty groups that were already non-empty
        newOpenState[serviceId] = openGroups[serviceId];
      } else {
        // Default: expand non-empty groups
        newOpenState[serviceId] = true;
      }
    });

    // Update the ref for next comparison
    prevTicketCounts.current = newTicketCounts;

    // Only update if there are actual changes to avoid unnecessary re-renders
    const hasChanges =
      Object.keys(newOpenState).length !== Object.keys(openGroups).length ||
      Object.entries(newOpenState).some(
        ([key, value]) => openGroups[key] !== value
      );

    if (hasChanges) {
      setOpenGroups(newOpenState);
    }
  }, [groupedWaiting, openGroups]);

  // Actions
  const handleCallNext = async () => {
    try {
      const result = await callNextMutation.mutateAsync({ counterId });
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
    <div className='container mx-auto flex-1 p-4'>
      <div className='mb-6 flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold'>{t('title')}</h1>
          <div className='text-muted-foreground'>
            {unit?.name} • {counterName}
          </div>
        </div>
        <Button
          variant='outline'
          onClick={() => releaseMutation.mutate()}
          disabled={releaseMutation.isPending}
        >
          <LogOut className='mr-2 h-4 w-4' />
          {t('logout')}
        </Button>
      </div>

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
            <Button variant='outline' onClick={() => setIsTransferOpen(false)}>
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

      <div className='mb-6 grid grid-cols-1 gap-6 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('current.title')}</CardTitle>
            <CardDescription>{t('current.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentTicket ? (
              <CurrentTicketDisplay
                ticket={currentTicket}
                t={t}
                onShowDetails={() => openDetails(currentTicket)}
              />
            ) : (
              <div className='py-4 text-center text-gray-500'>
                {t('current.noTicket')}
              </div>
            )}
            <div className='flex flex-col gap-2'>
              {currentTicket?.status === 'called' && (
                <Button
                  className='w-full bg-green-600 text-white hover:bg-green-700'
                  onClick={handleConfirmArrival}
                  disabled={confirmArrivalMutation.isPending}
                >
                  {t('actions.startService')}
                </Button>
              )}
              <div className='flex gap-2'>
                <Button
                  className='flex-1'
                  onClick={handleComplete}
                  disabled={!currentTicket || completeMutation.isPending}
                >
                  {t('current.complete')}
                </Button>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={() => setIsTransferOpen(true)}
                  disabled={!currentTicket || transferMutation.isPending}
                >
                  <ArrowRightLeft className='mr-2 h-4 w-4' />
                  {t('actions.transfer')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('actions.title')}</CardTitle>
            <CardDescription>{t('actions.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-2'>
              <Button
                className='w-full'
                onClick={handleCallNext}
                disabled={
                  callNextMutation.isPending ||
                  waitingTickets.length === 0 ||
                  !!currentTicket
                }
              >
                {callNextMutation.isPending
                  ? t('processing')
                  : t('actions.callNext')}
              </Button>
              <Button
                variant='outline'
                className='w-full'
                onClick={handleNoShow}
                disabled={!currentTicket || noShowMutation.isPending}
              >
                {t('actions.noShow')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('queue.title')}</CardTitle>
          <CardDescription>{t('queue.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-2'>
            {Object.keys(groupedWaiting).length > 0 ? (
              Object.entries(groupedWaiting).map(
                ([serviceId, ticketsForService]) => (
                  <div key={serviceId}>
                    <div className='bg-muted flex items-center justify-between rounded p-2'>
                      <div className='font-medium'>
                        {serviceId === 'uncategorized'
                          ? t('queue.uncategorized')
                          : serviceNames[serviceId] || serviceId}
                        <span className='text-muted-foreground ml-2 text-sm'>
                          ({ticketsForService.length})
                        </span>
                      </div>
                      <div>
                        <div className='flex items-center gap-2'>
                          {serviceId !== 'uncategorized' && (
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={(e) => {
                                e.stopPropagation();
                                createTicketMutation.mutate(serviceId);
                              }}
                              disabled={createTicketMutation.isPending}
                            >
                              <Plus className='mr-1 h-4 w-4' />
                              {t('actions.createTicket')}
                            </Button>
                          )}
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() =>
                              setOpenGroups((prev) => ({
                                ...prev,
                                [serviceId]: !prev[serviceId]
                              }))
                            }
                          >
                            {openGroups[serviceId]
                              ? t('queue.hide')
                              : t('queue.show')}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {openGroups[serviceId] && (
                      <div className='mt-2 space-y-2'>
                        {ticketsForService.map((ticket) => (
                          <StaffTicketItem
                            key={ticket.id}
                            ticket={ticket}
                            onCall={async () => {
                              setInProgressTicketId(ticket.id);
                              try {
                                await pickMutation.mutateAsync({
                                  id: ticket.id,
                                  counterId
                                });
                                await refetch();
                              } catch (e) {
                                console.error('Failed to pick ticket:', e);
                              } finally {
                                setInProgressTicketId(null);
                              }
                            }}
                            disabled={
                              pickMutation.isPending ||
                              inProgressTicketId === ticket.id ||
                              !!currentTicket
                            }
                            t={t}
                            onShowDetails={() => openDetails(ticket)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              )
            ) : (
              <div className='py-4 text-center text-gray-500'>
                {t('queue.noTickets')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StaffTicketItem({
  ticket,
  onCall,
  disabled,
  t,
  onShowDetails
}: {
  ticket: Ticket;
  onCall: () => void;
  disabled: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onShowDetails: () => void;
}) {
  const { background, formatTime, elapsed } = useTicketTimer(
    ticket.createdAt || undefined,
    ticket.maxWaitingTime
  );

  return (
    <div
      className='relative flex items-center justify-between overflow-hidden rounded border p-2'
      style={{ background: background || undefined }}
    >
      <div className='relative z-10'>
        <div className='font-semibold'>{ticket.queueNumber}</div>
        <div className='text-xs text-gray-600'>
          {t(`statuses.${ticket.status}`)} • {t('queue.waiting')}:{' '}
          {formatTime(elapsed)}
          {ticket.maxWaitingTime && (
            <span className='ml-2 opacity-70'>
              Max: {formatTime(ticket.maxWaitingTime)}
            </span>
          )}
          {ticket.preRegistration && (
            <>
              <span className='ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800'>
                {t('pre_registration.badge', { defaultValue: 'PRE' })}
              </span>
              <span className='ml-1 text-xs font-medium text-blue-800'>
                {ticket.preRegistration.time}
              </span>
            </>
          )}
        </div>
      </div>
      <div className='relative z-10 flex items-center gap-2'>
        <Button size='sm' onClick={onCall} disabled={disabled}>
          {t('actions.call')}
        </Button>
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

function CurrentTicketDisplay({
  ticket,
  t,
  onShowDetails
}: {
  ticket: Ticket;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onShowDetails: () => void;
}) {
  const isInService = ticket.status === 'in_service';

  // Service Timer (Active)
  // User requested to count from "moment of call" (calledAt).
  const { formatTime: formatServiceTime, elapsed: serviceElapsed } =
    useTicketTimer(isInService ? ticket.calledAt || undefined : undefined);

  // Waiting Time (Static)
  // Calculated from createdAt to calledAt
  const waitingSeconds = useMemo(() => {
    if (!ticket.createdAt || !ticket.calledAt) return 0;
    const start = new Date(ticket.createdAt).getTime();
    const end = new Date(ticket.calledAt).getTime();
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [ticket.createdAt, ticket.calledAt]);

  // Helper to format static seconds
  const formatStaticTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
  };

  // Background logic:
  // If in service, maybe green or neutral?
  // User didn't specify background for service, but "visual indicators" were requested before.
  // Let's keep it neutral/white for now as the focus is on the timer, or maybe light green if active.
  // The previous "waiting" gradient logic is less relevant for the main card now that waiting is over.
  // Let's use a clean card style.

  return (
    <div className='bg-card text-card-foreground mb-4 flex items-center justify-between rounded-lg border p-6 shadow-sm'>
      {/* Left/Center: Main Info */}
      <div className='flex-1 text-center'>
        <div className='text-5xl font-bold tracking-tight'>
          {ticket.queueNumber}
        </div>
        <div className='text-muted-foreground mt-2 text-lg font-medium'>
          {t(`statuses.${ticket.status}`)}
        </div>

        {/* Service Time Display */}
        {isInService && (
          <div className='mt-4'>
            <div className='text-muted-foreground mb-1 text-sm text-xs tracking-wider uppercase'>
              {t('queue.service_time')}
            </div>
            <div className='font-mono text-3xl font-semibold text-green-600'>
              {formatServiceTime(serviceElapsed)}
            </div>
          </div>
        )}
      </div>

      {/* Right: Stats */}
      <div className='ml-6 flex flex-col gap-3 border-l py-2 pl-6 text-right'>
        <div>
          <div className='text-muted-foreground mb-0.5 text-xs tracking-wider uppercase'>
            {t('queue.waiting')}
          </div>
          <div className='font-mono text-xl font-medium'>
            {formatStaticTime(waitingSeconds)}
          </div>
        </div>

        {ticket.maxWaitingTime && (
          <div>
            <div className='text-muted-foreground mb-0.5 text-xs tracking-wider uppercase'>
              {t('queue.max_label')}
            </div>
            <div className='text-muted-foreground font-mono text-sm'>
              {formatStaticTime(ticket.maxWaitingTime)}
            </div>
          </div>
        )}

        {ticket.preRegistration && (
          <div className='mt-2 border-t pt-2'>
            <div className='text-muted-foreground mb-0.5 flex items-center justify-end gap-1 text-xs tracking-wider uppercase'>
              {t('pre_registration.title', {
                defaultValue: 'Pre-registration'
              })}
              <Button
                variant='ghost'
                size='icon'
                className='h-4 w-4'
                onClick={onShowDetails}
              >
                <Info className='h-3 w-3' />
              </Button>
            </div>
            <div className='text-sm font-medium'>
              {ticket.preRegistration.customerName}
            </div>
            <div className='text-muted-foreground text-xs'>
              {ticket.preRegistration.customerPhone}
            </div>
            {ticket.preRegistration.comment && (
              <div className='mt-1 text-xs italic'>
                &quot;{ticket.preRegistration.comment}&quot;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
