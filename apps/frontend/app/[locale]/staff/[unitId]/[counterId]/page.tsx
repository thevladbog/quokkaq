'use client';

import { useState, useEffect, useMemo, useRef, use } from 'react';
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
  usePickTicket,
  useConfirmArrivalTicket,
  useReturnToQueueTicket,
  useRecallTicket,
  useUnitServices,
  useClientVisits
} from '@/lib/hooks';
import { getGetUnitsUnitIdCountersQueryKey } from '@/lib/api/generated/tickets-counters';
import {
  getGetUnitByIDQueryKey,
  getGetUnitsUnitIdChildUnitsQueryKey
} from '@/lib/api/generated/units';
import {
  ApiHttpError,
  countersApi,
  unitsApi,
  Ticket,
  type Service
} from '@/lib/api';
import { normalizeChildUnitsQueryData } from '@/lib/child-units-query';
import { getUnitDisplayName } from '@/lib/unit-display';

/** Stable empty refs so React Query “no data yet” does not allocate a new [] every render (avoids effect loops on [data]). */
const EMPTY_TICKET_LIST: Ticket[] = [];
const EMPTY_SERVICE_LIST: Service[] = [];
const EMPTY_SERVICE_ID_LIST: string[] = [];
const NON_ACTIVE_TICKET_STATUSES = new Set([
  'waiting',
  'served',
  'completed',
  'no_show',
  'cancelled'
]);
import { socketClient } from '@/lib/socket';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Coffee, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PreRegistrationDetailsModal } from '@/components/staff/PreRegistrationDetailsModal';
import { StaffCurrentTicketHero } from '@/components/staff/StaffCurrentTicketHero';
import { StaffIdleWorkstationHero } from '@/components/staff/StaffIdleWorkstationHero';
import { StaffWorkstationActionPanel } from '@/components/staff/StaffWorkstationActionPanel';
import { StaffQueuePanel } from '@/components/staff/StaffQueuePanel';
import { StaffVisitorDetailsSheet } from '@/components/staff/StaffVisitorDetailsSheet';
import { StaffWorkstationShell } from '@/components/staff/StaffWorkstationShell';
import { useSyncActiveUnit } from '@/contexts/ActiveUnitContext';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  PermTicketsViewUserData,
  userUnitPermissionMatches
} from '@/lib/permission-variants';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';
import { cn } from '@/lib/utils';
import { formatWaitDurationSeconds } from '@/components/supervisor/supervisor-queue-utils';
import { useLiveElapsedSecondsSince } from '@/lib/use-live-elapsed-since';
import {
  deriveStaffQueueView,
  summarizeServiceScope,
  type StaffServiceScopeStatus
} from '@/lib/staff-workstation-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

function serviceAllowedInZone(s: Service, zoneId: string): boolean {
  const r = s.restrictedServiceZoneId?.trim();
  if (!r) return true;
  return r === zoneId;
}

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
  const { user } = useAuthContext();
  const canReadUserData = useMemo(
    () =>
      isTenantAdminUser(user) ||
      userUnitPermissionMatches(
        user?.permissions?.[unitId] ?? [],
        PermTicketsViewUserData
      ),
    [user, unitId]
  );
  useSyncActiveUnit(unitId);
  const [inProgressTicketId, setInProgressTicketId] = useState<string | null>(
    null
  );
  const [detailsTicket, setDetailsTicket] = useState<Ticket | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [visitorDetailsOpen, setVisitorDetailsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const openDetails = (ticket: Ticket) => {
    setDetailsTicket(ticket);
    setIsDetailsOpen(true);
  };

  // Fetch Unit Info for display
  const { data: unit } = useQuery({
    queryKey: getGetUnitByIDQueryKey(unitId),
    queryFn: () => unitsApi.getById(unitId)
  });

  // Fetch Counter Info for display
  const { data: counters } = useQuery({
    queryKey: getGetUnitsUnitIdCountersQueryKey(unitId),
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
    error: ticketsError,
    isPending: ticketsPending,
    isFetching: ticketsFetching,
    refetch
  } = useTickets(unitId, {
    enabled: Boolean(unitId),
    refetchInterval: 12_000
  });
  const tickets = ticketsData ?? EMPTY_TICKET_LIST;
  const completeMutation = useCompleteTicket();
  const noShowMutation = useNoShowTicket();
  const callNextMutation = useCallNextTicket();
  const transferMutation = useTransferTicket();
  const pickMutation = usePickTicket();
  const confirmArrivalMutation = useConfirmArrivalTicket();
  const returnToQueueMutation = useReturnToQueueTicket();
  const recallMutation = useRecallTicket();

  const createTicketMutation = useMutation({
    mutationFn: (vars: { serviceId: string; clientId?: string }) =>
      unitsApi.createTicket(unitId, vars),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      setActionError(null);
      toast.success(t('messages.ticketCreated'));
      refetch();
    },
    onError: () => {
      const message = t('messages.failed', {
        action: t('actions.createTicket')
      });
      setActionError(message);
      toast.error(message);
    }
  });

  const queryClient = useQueryClient();

  // Logout / Release Mutation
  const releaseMutation = useMutation({
    mutationFn: () => countersApi.release(counterId),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdCountersQueryKey(unitId)
      });
      queryClient.invalidateQueries({
        queryKey: ['shift-counters', unitId]
      });
      // Otherwise /staff still has cached { kind: 'redirect' } and sends the user back here.
      queryClient.removeQueries({ queryKey: ['staff-workstation-bootstrap'] });
      router.push('/staff');
    },
    onError: (error: Error) => {
      logger.error('Failed to release counter', { error });
      setActionError(t('logout_failed', { error: error.message }));
      toast.error(t('logout_failed', { error: error.message }));
    }
  });

  const startBreakMutation = useMutation({
    mutationFn: () => countersApi.startBreak(counterId),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdCountersQueryKey(unitId)
      });
      queryClient.invalidateQueries({ queryKey: ['shift-counters'] });
      toast.success(t('workstation.break_started'));
      refetch();
    },
    onError: (error: Error) => {
      const detail = error.message.trim() ? error.message : undefined;
      const message =
        error instanceof ApiHttpError &&
        error.code === 'counter_break_active_ticket'
          ? t('workstation.break_needs_no_ticket')
          : t('workstation.break_error');
      setActionError(message);
      toast.error(message, {
        description: detail
      });
    }
  });

  const endBreakMutation = useMutation({
    mutationFn: () => countersApi.endBreak(counterId),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdCountersQueryKey(unitId)
      });
      queryClient.invalidateQueries({ queryKey: ['shift-counters'] });
      toast.success(t('workstation.break_ended'));
      refetch();
    },
    onError: (error: Error) => {
      const detail = error.message.trim() ? error.message : undefined;
      setActionError(t('workstation.break_error'));
      toast.error(t('workstation.break_error'), {
        description: detail
      });
    }
  });

  const currentTicket =
    tickets.find(
      (ticket) => ticket.status === 'called' || ticket.status === 'in_service'
    ) ??
    tickets.find(
      (ticket) =>
        ticket.counter?.id === counterId &&
        !NON_ACTIVE_TICKET_STATUSES.has(ticket.status)
    );
  const waitingTickets = tickets.filter(
    (ticket) => ticket.status === 'waiting'
  );

  const activeClientId =
    currentTicket?.client && !currentTicket.client.isAnonymous
      ? currentTicket.client.id
      : undefined;
  const { data: activeClientVisits } = useClientVisits(unitId, activeClientId, {
    enabled: Boolean(activeClientId)
  });
  const activeVisitTransferTrail = useMemo(
    () =>
      activeClientVisits?.items.find((visit) => visit.id === currentTicket?.id)
        ?.transferTrail,
    [activeClientVisits?.items, currentTicket?.id]
  );

  useEffect(() => {
    setVisitorDetailsOpen(false);
  }, [currentTicket?.id]);

  const {
    data: servicesData,
    error: servicesError,
    isPending: servicesPending,
    isFetching: servicesFetching,
    refetch: refetchServices
  } = useUnitServices(unitId);
  const services = servicesData ?? EMPTY_SERVICE_LIST;

  const leafServiceIds = useMemo(
    () => services.filter((s) => s.isLeaf).map((s) => s.id),
    [services]
  );

  const scopeStorageKey = `staff-service-scope:${unitId}:${counterId}`;
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[] | null>(
    null
  );
  const [hydratedScopeStorageKey, setHydratedScopeStorageKey] = useState<
    string | null
  >(null);
  const serviceCatalogReady =
    !servicesPending && !servicesError && servicesData !== undefined;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!serviceCatalogReady) return;
    if (!leafServiceIds.length) {
      setSelectedServiceIds([]);
      setHydratedScopeStorageKey(scopeStorageKey);
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
    setHydratedScopeStorageKey(scopeStorageKey);
  }, [scopeStorageKey, leafServiceIds, serviceCatalogReady]);

  const scopeHydrated =
    hydratedScopeStorageKey === scopeStorageKey && selectedServiceIds !== null;

  useEffect(() => {
    if (selectedServiceIds === null || typeof window === 'undefined') return;
    if (!scopeHydrated) return;
    localStorage.setItem(scopeStorageKey, JSON.stringify(selectedServiceIds));
  }, [scopeStorageKey, scopeHydrated, selectedServiceIds]);

  const scopeForFilter =
    scopeHydrated && selectedServiceIds
      ? selectedServiceIds
      : EMPTY_SERVICE_ID_LIST;
  const serviceScopeStatus: StaffServiceScopeStatus = servicesError
    ? 'error'
    : servicesPending || servicesData === undefined
      ? 'pending'
      : scopeHydrated
        ? 'ready'
        : 'hydrating';

  const [showAllQueueTickets, setShowAllQueueTickets] = useState(false);

  const onlyMyZoneKey = `staff-queue-only-my-zone:${unitId}:${counterId}`;
  const [onlyMyZone, setOnlyMyZone] = useState(false);
  const [loadedOnlyMyZoneKey, setLoadedOnlyMyZoneKey] = useState<string | null>(
    null
  );

  useEffect(() => {
    setShowAllQueueTickets(false);
  }, [unitId, counterId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setOnlyMyZone(localStorage.getItem(onlyMyZoneKey) === '1');
    } catch {
      /* ignore */
    } finally {
      setLoadedOnlyMyZoneKey(onlyMyZoneKey);
    }
  }, [onlyMyZoneKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loadedOnlyMyZoneKey !== onlyMyZoneKey) return;
    try {
      localStorage.setItem(onlyMyZoneKey, onlyMyZone ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [loadedOnlyMyZoneKey, onlyMyZoneKey, onlyMyZone]);

  const queueView = useMemo(
    () =>
      deriveStaffQueueView({
        waitingTickets,
        serviceScopeStatus,
        selectedServiceIds: scopeForFilter,
        allLeafServiceIds: leafServiceIds,
        onlyMyZone,
        counterServiceZoneId: myCounter?.serviceZoneId,
        showAllTemporarily: showAllQueueTickets
      }),
    [
      waitingTickets,
      serviceScopeStatus,
      scopeForFilter,
      leafServiceIds,
      onlyMyZone,
      myCounter?.serviceZoneId,
      showAllQueueTickets
    ]
  );

  const conflictingActionPending =
    Boolean(inProgressTicketId) ||
    callNextMutation.isPending ||
    pickMutation.isPending ||
    confirmArrivalMutation.isPending ||
    completeMutation.isPending ||
    noShowMutation.isPending ||
    returnToQueueMutation.isPending ||
    recallMutation.isPending ||
    transferMutation.isPending ||
    startBreakMutation.isPending ||
    endBreakMutation.isPending ||
    releaseMutation.isPending;

  const refetchTicketsRef = useRef(refetch);
  useEffect(() => {
    refetchTicketsRef.current = refetch;
  }, [refetch]);

  // WebSocket Connection
  useEffect(() => {
    if (!unitId) return;

    socketClient.connect(unitId);

    const handleTicketUpdate = () => {
      void refetchTicketsRef.current();
    };

    socketClient.onTicketCreated(handleTicketUpdate);
    socketClient.onTicketUpdated(handleTicketUpdate);
    socketClient.onTicketCalled(handleTicketUpdate);

    const onKioskSurveyLow = (d: {
      unitId: string;
      ticketId: string;
      score: number;
    }) => {
      if (d.unitId !== unitId) return;
      toast.warning(
        t('kiosk_survey_low', { score: d.score, ticket: d.ticketId })
      );
    };
    socketClient.onKioskSurveyLow(onKioskSurveyLow);

    return () => {
      socketClient.off('ticket.created', handleTicketUpdate);
      socketClient.off('ticket.updated', handleTicketUpdate);
      socketClient.off('ticket.called', handleTicketUpdate);
      socketClient.offKioskSurveyLow(onKioskSurveyLow);
      socketClient.disconnect();
    };
  }, [unitId, t]);

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

  const scopeSummary = useMemo(
    () => summarizeServiceScope(leafServicesForScope, scopeForFilter),
    [leafServicesForScope, scopeForFilter]
  );

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
    if (conflictingActionPending || !queueView.serviceScopeReady) return;
    setActionError(null);
    const fallbackMessage = t('messages.failed', {
      action: t('actions.callNext')
    });
    try {
      const result = await callNextMutation.mutateAsync({
        counterId,
        serviceIds: queueView.callNextServiceIds
      });
      if (!result || !result.ok) {
        const message = result?.message || fallbackMessage;
        setActionError(message);
        toast.error(message);
      } else {
        setActionError(null);
        const number = result.ticket?.queueNumber || 'NEXT';
        toast.success(t('messages.called', { number }));
      }
      await refetch();
    } catch (error) {
      logger.error('Failed to call next', { error });
      setActionError(fallbackMessage);
      toast.error(fallbackMessage);
    }
  };

  const handleConfirmArrival = async () => {
    if (!currentTicket || conflictingActionPending) return;
    setActionError(null);
    const message = t('messages.failed', {
      action: t('actions.startService')
    });
    try {
      await confirmArrivalMutation.mutateAsync(currentTicket.id);
      setActionError(null);
      toast.success(
        t('messages.serviceStarted', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      logger.error('Failed to start service', { error });
      setActionError(message);
      toast.error(message);
    }
  };

  const handleComplete = async () => {
    if (!currentTicket || conflictingActionPending) return;
    setActionError(null);
    const message = t('messages.failed', { action: t('current.complete') });
    try {
      await completeMutation.mutateAsync(currentTicket.id);
      setActionError(null);
      toast.success(
        t('messages.completed', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      logger.error('Failed to complete ticket', { error });
      setActionError(message);
      toast.error(message);
    }
  };

  const handleNoShow = async () => {
    if (!currentTicket || conflictingActionPending) return;
    setActionError(null);
    const message = t('messages.failed', { action: t('actions.noShow') });
    try {
      await noShowMutation.mutateAsync(currentTicket.id);
      setActionError(null);
      toast.success(
        t('messages.noShow', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      logger.error('Failed to mark no-show', { error });
      setActionError(message);
      toast.error(message);
    }
  };

  const handleReturnToQueue = async () => {
    if (!currentTicket || conflictingActionPending) return;
    setActionError(null);
    const message = t('messages.failed', {
      action: t('actions.returnToQueue')
    });
    try {
      await returnToQueueMutation.mutateAsync(currentTicket.id);
      setActionError(null);
      toast.success(
        t('messages.returnedToQueue', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      logger.error('Failed to return ticket to queue', {
        error,
        ticketId: currentTicket.id,
        counterId,
        unitId
      });
      setActionError(message);
      toast.error(message);
    }
  };

  const handleRecall = async () => {
    if (!currentTicket || conflictingActionPending) return;
    setActionError(null);
    const message = t('messages.failed', { action: t('actions.recall') });
    try {
      await recallMutation.mutateAsync(currentTicket.id);
      setActionError(null);
      toast.success(
        t('messages.recalled', { number: currentTicket.queueNumber })
      );
      await refetch();
    } catch (error) {
      logger.error('Failed to recall ticket', { error });
      setActionError(message);
      toast.error(message);
    }
  };

  // Transfer Dialog State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<'counter' | 'zone'>(
    'counter'
  );
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferZoneId, setTransferZoneId] = useState('');
  const [transferServiceId, setTransferServiceId] = useState('');
  const [transferCommentDraft, setTransferCommentDraft] = useState('');

  const countersForTransfer = counters ?? [];

  const { data: childUnitsRaw } = useQuery({
    queryKey: getGetUnitsUnitIdChildUnitsQueryKey(unitId),
    queryFn: () => unitsApi.getChildUnits(unitId),
    enabled: !!unitId && isTransferOpen
  });

  const serviceZones = useMemo(
    () =>
      normalizeChildUnitsQueryData(childUnitsRaw).filter(
        (u) => u.kind === 'service_zone'
      ),
    [childUnitsRaw]
  );

  const ticketServiceRow = useMemo(
    () => services.find((s) => s.id === currentTicket?.serviceId),
    [services, currentTicket?.serviceId]
  );

  const zoneTransferNeedsService =
    transferMode === 'zone' &&
    !!transferZoneId &&
    !!ticketServiceRow &&
    !serviceAllowedInZone(ticketServiceRow, transferZoneId);

  const zoneTransferServices = useMemo(() => {
    if (!transferZoneId) return [];
    return services.filter(
      (s) => s.isLeaf && serviceAllowedInZone(s, transferZoneId)
    );
  }, [services, transferZoneId]);

  useEffect(() => {
    if (!isTransferOpen) return;
    setTransferServiceId('');
  }, [transferZoneId, transferMode, isTransferOpen]);

  const openTransferDialog = () => {
    if (conflictingActionPending) return;
    setActionError(null);
    if (currentTicket) {
      setTransferCommentDraft(currentTicket.operatorComment ?? '');
      setTransferMode('counter');
      setTransferTargetId('');
      setTransferZoneId('');
      setTransferServiceId('');
    }
    setIsTransferOpen(true);
  };

  const handleTransfer = async () => {
    if (!currentTicket || conflictingActionPending) return;
    setActionError(null);
    const failureMessage = t('messages.failed', {
      action: t('actions.transfer')
    });
    const origComment = (currentTicket.operatorComment ?? '').trim();
    const draft = transferCommentDraft.trim();
    const commentPatch =
      draft === origComment ? undefined : draft.length > 0 ? draft : null;
    try {
      if (transferMode === 'counter') {
        if (!transferTargetId) return;
        await transferMutation.mutateAsync({
          id: currentTicket.id,
          toCounterId: transferTargetId,
          ...(commentPatch !== undefined
            ? { operatorComment: commentPatch }
            : {})
        });
      } else {
        if (!transferZoneId) return;
        if (zoneTransferNeedsService && !transferServiceId.trim()) {
          const message = t('transfer_service_required');
          setActionError(message);
          toast.error(message);
          return;
        }
        let toServiceId: string | undefined;
        if (zoneTransferNeedsService) {
          toServiceId = transferServiceId.trim();
        } else if (transferServiceId.trim()) {
          toServiceId = transferServiceId.trim();
        }
        await transferMutation.mutateAsync({
          id: currentTicket.id,
          toServiceZoneId: transferZoneId,
          toServiceId,
          ...(commentPatch !== undefined
            ? { operatorComment: commentPatch }
            : {})
        });
      }
      toast.success(
        t('messages.transferred', { number: currentTicket.queueNumber })
      );
      setActionError(null);
      setIsTransferOpen(false);
      setTransferTargetId('');
      setTransferZoneId('');
      setTransferServiceId('');
      await refetch();
    } catch (error) {
      logger.error('Failed to transfer ticket', { error });
      setActionError(failureMessage);
      toast.error(failureMessage);
    }
  };

  const transferSubmitDisabled =
    conflictingActionPending ||
    (transferMode === 'counter' && !transferTargetId) ||
    (transferMode === 'zone' &&
      (!transferZoneId ||
        (zoneTransferNeedsService && !transferServiceId.trim())));

  return (
    <>
      {/* Transfer Dialog */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className='max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{t('actions.transfer')}</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <Label>{t('transfer_mode_label')}</Label>
              <Select
                value={transferMode}
                onValueChange={(v) => {
                  setTransferMode(v as 'counter' | 'zone');
                  setTransferTargetId('');
                  setTransferZoneId('');
                  setTransferServiceId('');
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='counter'>
                    {t('transfer_mode_counter')}
                  </SelectItem>
                  <SelectItem value='zone'>
                    {t('transfer_mode_zone')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transferMode === 'counter' ? (
              <div>
                <Label className='mb-2 block'>
                  {t('select_counter_label')}
                </Label>
                <div className='grid max-h-48 gap-2 overflow-y-auto'>
                  {countersForTransfer
                    .filter((c) => c.id !== counterId)
                    .map((counter) => (
                      <Button
                        key={counter.id}
                        type='button'
                        variant={
                          transferTargetId === counter.id
                            ? 'default'
                            : 'outline'
                        }
                        className='justify-start'
                        onClick={() => setTransferTargetId(counter.id)}
                      >
                        {counter.name}
                      </Button>
                    ))}
                  {countersForTransfer.filter((c) => c.id !== counterId)
                    .length === 0 && (
                    <p className='text-muted-foreground text-sm'>
                      {t('no_other_counters')}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className='space-y-3'>
                <div className='space-y-2'>
                  <Label>{t('transfer_zone_label')}</Label>
                  <Select
                    value={transferZoneId || undefined}
                    onValueChange={setTransferZoneId}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={t('transfer_zone_placeholder')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceZones
                        .filter(
                          (z): z is typeof z & { id: string } =>
                            typeof z.id === 'string' && z.id.trim().length > 0
                        )
                        .map((z) => (
                          <SelectItem key={z.id} value={z.id}>
                            {z.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {serviceZones.length === 0 && (
                    <p className='text-muted-foreground text-xs'>
                      {t('transfer_no_zones')}
                    </p>
                  )}
                </div>
                {transferZoneId ? (
                  <div className='space-y-2'>
                    <Label>
                      {zoneTransferNeedsService
                        ? t('transfer_service_required_label')
                        : t('transfer_service_optional_label')}
                    </Label>
                    {zoneTransferNeedsService ? (
                      <Select
                        value={transferServiceId || undefined}
                        onValueChange={setTransferServiceId}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue
                            placeholder={t('transfer_service_placeholder')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {zoneTransferServices.map((s) => {
                            const label =
                              locale === 'ru'
                                ? s.nameRu || s.nameEn || s.name
                                : s.nameEn || s.nameRu || s.name;
                            return (
                              <SelectItem key={s.id} value={s.id}>
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={transferServiceId || '__keep__'}
                        onValueChange={(v) =>
                          setTransferServiceId(v === '__keep__' ? '' : v)
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue
                            placeholder={t('transfer_service_placeholder')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='__keep__'>
                            {t('transfer_service_keep_current')}
                          </SelectItem>
                          {zoneTransferServices.map((s) => {
                            const label =
                              locale === 'ru'
                                ? s.nameRu || s.nameEn || s.name
                                : s.nameEn || s.nameRu || s.name;
                            return (
                              <SelectItem key={s.id} value={s.id}>
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    {zoneTransferNeedsService &&
                      zoneTransferServices.length === 0 && (
                        <p className='text-destructive text-xs'>
                          {t('transfer_no_services_in_zone')}
                        </p>
                      )}
                  </div>
                ) : null}
              </div>
            )}

            <div className='space-y-2'>
              <Label htmlFor='transfer-operator-comment'>
                {t('visitor_context.comment_label')}
              </Label>
              <Textarea
                id='transfer-operator-comment'
                rows={3}
                className='resize-y'
                placeholder={t('visitor_context.comment_placeholder')}
                value={transferCommentDraft}
                onChange={(e) => setTransferCommentDraft(e.target.value)}
              />
              <p className='text-muted-foreground text-[11px] leading-snug'>
                {t('transfer_comment_hint')}
              </p>
            </div>
          </div>
          {actionError && (
            <p className='text-destructive text-sm' role='alert'>
              {t('actions.action_error', { message: actionError })}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              type='button'
              onClick={() => setIsTransferOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type='button'
              onClick={handleTransfer}
              disabled={transferSubmitDisabled}
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
        canReadUserData={canReadUserData}
      />

      <StaffVisitorDetailsSheet
        open={visitorDetailsOpen}
        onOpenChange={setVisitorDetailsOpen}
        unitId={unitId}
        ticket={currentTicket}
        locale={locale}
        t={t}
      />

      <StaffWorkstationShell
        unitName={unit ? getUnitDisplayName(unit, locale) : '—'}
        counterName={counterName}
        operatorName={user?.name?.trim() || '—'}
        statusControls={
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <span
              className={cn(
                'inline-flex h-9 items-center rounded-md border px-3 text-xs font-semibold',
                workstationOnBreak
                  ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
              )}
              role='status'
            >
              {workstationOnBreak
                ? t('current.break_title')
                : t('workstation.status_active')}
            </span>
            {!workstationOnBreak && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-9'
                onClick={() => startBreakMutation.mutate()}
                disabled={conflictingActionPending || Boolean(currentTicket)}
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
              disabled={conflictingActionPending}
            >
              <LogOut className='mr-2 h-3.5 w-3.5' />
              {t('logout')}
            </Button>
          </div>
        }
        main={
          <Card className='border-border/70 flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0 shadow-sm'>
            <CardHeader className='border-border/50 shrink-0 space-y-0.5 border-b px-4 py-1.5 [.border-b]:pb-1.5'>
              <CardTitle className='text-sm leading-tight font-semibold'>
                {t('current.title')}
              </CardTitle>
              <CardDescription className='text-[11px] leading-snug'>
                {t('current.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 pt-3 pb-4'>
              {ticketsError && (
                <Alert variant='destructive' className='shrink-0'>
                  <AlertTriangle aria-hidden />
                  <AlertDescription>
                    <p>
                      {t('current.load_error', {
                        message: ticketsError.message
                      })}
                    </p>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      className='mt-2 h-9'
                      onClick={() => void refetch()}
                    >
                      {t('current.retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {ticketsPending && !ticketsData ? (
                <div
                  data-testid='staff-current-ticket-skeleton'
                  className='border-border/60 bg-muted/20 flex shrink-0 items-center gap-3 rounded-lg border p-3'
                  role='status'
                >
                  <Skeleton className='size-16 shrink-0 rounded-lg' />
                  <div className='flex-1 space-y-2'>
                    <p className='text-muted-foreground text-sm'>
                      {t('current.loading')}
                    </p>
                    <Skeleton className='h-5 w-2/3' />
                    <Skeleton className='h-4 w-1/2' />
                  </div>
                </div>
              ) : workstationOnBreak ? (
                <div
                  className={cn(
                    'flex shrink-0 flex-col items-center rounded-xl border border-dashed px-4 py-5 text-center',
                    'border-amber-400/50 bg-amber-50/40 dark:border-amber-700/50 dark:bg-amber-950/25'
                  )}
                >
                  <Coffee
                    className='h-10 w-10 text-amber-900/75 dark:text-amber-200/85'
                    strokeWidth={1.5}
                  />
                  <p className='text-foreground mt-3 text-lg font-semibold'>
                    {t('current.break_title')}
                  </p>
                  <p className='text-muted-foreground mx-auto mt-1 max-w-md text-sm leading-relaxed'>
                    {t('current.break_subtitle')}
                  </p>
                  <p className='text-foreground mt-3 font-mono text-base font-semibold tabular-nums'>
                    {t('current.break_duration')}:{' '}
                    {formatWaitDurationSeconds(breakElapsedSec)}
                  </p>
                </div>
              ) : currentTicket ? (
                <StaffCurrentTicketHero
                  unitId={unitId}
                  ticket={currentTicket}
                  serviceName={
                    serviceNames[currentTicket.serviceId] ||
                    currentTicket.serviceId ||
                    t('queue.uncategorized')
                  }
                  t={t}
                  onShowDetails={() => openDetails(currentTicket)}
                  transferTrail={activeVisitTransferTrail}
                  locale={locale}
                  onOpenVisitorDetails={() => setVisitorDetailsOpen(true)}
                  canReadUserData={canReadUserData}
                />
              ) : (
                <StaffIdleWorkstationHero
                  waitingCount={queueView.scopedWaiting.length}
                  scopeSummary={t('current.scope_empty_hint', {
                    count: queueView.scopedWaiting.length
                  })}
                  t={t}
                />
              )}

              <StaffWorkstationActionPanel
                t={t}
                workstationOnBreak={workstationOnBreak}
                currentTicket={currentTicket}
                waitingCount={queueView.scopedWaiting.length}
                conflictingActionPending={conflictingActionPending}
                actionError={actionError}
                resumePending={endBreakMutation.isPending}
                releasePending={releaseMutation.isPending}
                callNextPending={callNextMutation.isPending}
                confirmArrivalPending={confirmArrivalMutation.isPending}
                completePending={completeMutation.isPending}
                transferPending={transferMutation.isPending}
                noShowPending={noShowMutation.isPending}
                returnToQueuePending={returnToQueueMutation.isPending}
                recallPending={recallMutation.isPending}
                onResume={() => endBreakMutation.mutate()}
                onCallNext={handleCallNext}
                onConfirmArrival={handleConfirmArrival}
                onComplete={handleComplete}
                onOpenTransfer={openTransferDialog}
                onNoShow={handleNoShow}
                onReturnToQueue={handleReturnToQueue}
                onRecall={handleRecall}
              />
            </CardContent>
          </Card>
        }
        queue={
          <StaffQueuePanel
            t={t}
            unitId={unitId}
            canReadUserData={canReadUserData}
            counterOnBreak={workstationOnBreak}
            waitingTickets={queueView.visibleWaiting}
            scopedWaitingCount={queueView.scopedWaiting.length}
            queuePending={
              ticketsPending ||
              serviceScopeStatus === 'pending' ||
              serviceScopeStatus === 'hydrating'
            }
            queueRefreshing={
              (ticketsFetching && !ticketsPending) ||
              (servicesFetching && serviceScopeStatus === 'ready')
            }
            queueError={ticketsError ?? servicesError}
            onRetryQueue={() => {
              void refetch();
              void refetchServices();
            }}
            showAllTicketsInQueue={showAllQueueTickets}
            onShowAllTicketsInQueueChange={setShowAllQueueTickets}
            onlyMyZone={onlyMyZone}
            onOnlyMyZoneChange={setOnlyMyZone}
            serviceNames={serviceNames}
            leafServicesForCreate={leafServicesForScope}
            createTicketPending={createTicketMutation.isPending}
            onCreateTicket={async (input) => {
              await createTicketMutation.mutateAsync(input);
            }}
            scopeLeaves={leafServicesForScope}
            selectedScopeIds={scopeForFilter}
            scopeSummary={scopeSummary}
            onScopeChange={setSelectedServiceIds}
            pickPending={pickMutation.isPending}
            conflictingActionPending={conflictingActionPending}
            inProgressTicketId={inProgressTicketId}
            setInProgressTicketId={setInProgressTicketId}
            currentTicket={currentTicket}
            onPickTicket={async (ticket) => {
              if (conflictingActionPending || !queueView.serviceScopeReady) {
                return;
              }
              setActionError(null);
              const message = t('messages.failed', {
                action: t('actions.call')
              });
              try {
                await pickMutation.mutateAsync({
                  id: ticket.id,
                  counterId
                });
                setActionError(null);
                await refetch();
              } catch (error) {
                setActionError(message);
                toast.error(message);
                throw error;
              }
            }}
            onShowDetails={openDetails}
            services={services}
          />
        }
      />
    </>
  );
}
