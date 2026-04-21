'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  getGetUnitByIDQueryKey,
  getGetUnitsUnitIdChildWorkplacesQueryKey
} from '@/lib/api/generated/units';
import { shiftApi, unitsApi, Ticket } from '@/lib/api';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PreRegistrationDetailsModal } from '@/components/staff/PreRegistrationDetailsModal';
import { SupervisorShiftDashboard } from '@/components/supervisor/SupervisorShiftDashboard';
import { SlaAlertBanner } from '@/components/supervisor/SlaAlertBanner';
import type { ShiftCounterRow } from '@/components/supervisor/SupervisorWorkstationMonitoring';
import { useSyncActiveUnit } from '@/contexts/ActiveUnitContext';
import { getUnitDisplayName } from '@/lib/unit-display';
import { useSlaAlerts } from '@/hooks/use-sla-alerts';
import { socketClient } from '@/lib/socket';

export default function ShiftDashboardPage({
  params
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = use(params);
  const t = useTranslations('supervisor');
  const locale = useLocale();
  const queryClient = useQueryClient();
  useSyncActiveUnit(unitId);
  const { activeSlaAlerts, dismissAlert, dismissAllAlerts } =
    useSlaAlerts(unitId);

  useEffect(() => {
    if (!unitId) return;
    socketClient.connect(unitId);
    return () => {
      socketClient.disconnect();
    };
  }, [unitId]);

  const [showEODDialog, setShowEODDialog] = useState(false);
  const [forceReleaseDialogOpen, setForceReleaseDialogOpen] = useState(false);
  const [selectedCounter, setSelectedCounter] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [detailsTicket, setDetailsTicket] = useState<Ticket | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const openDetails = (ticket: Ticket) => {
    setDetailsTicket(ticket);
    setIsDetailsOpen(true);
  };

  const { data: unit } = useQuery({
    queryKey: getGetUnitByIDQueryKey(unitId),
    queryFn: () => unitsApi.getById(unitId)
  });

  const unitListsChildWorkplaces = unit?.kind === 'service_zone';

  const { data: childWorkplaces, isLoading: childWorkplacesLoading } = useQuery(
    {
      queryKey: getGetUnitsUnitIdChildWorkplacesQueryKey(unitId),
      queryFn: () => unitsApi.getChildWorkplaces(unitId),
      enabled: Boolean(unitListsChildWorkplaces)
    }
  );

  const hasWorkplaceChildren = (childWorkplaces ?? []).length > 0;

  const [workplaceTabId, setWorkplaceTabId] = useState<string | null>(null);

  const selectedWorkplaceId = useMemo(() => {
    if (!unitListsChildWorkplaces || !hasWorkplaceChildren) return null;
    const list = childWorkplaces ?? [];
    if (workplaceTabId && list.some((w) => w.id === workplaceTabId)) {
      return workplaceTabId;
    }
    return list[0]!.id;
  }, [
    unitListsChildWorkplaces,
    hasWorkplaceChildren,
    childWorkplaces,
    workplaceTabId
  ]);

  const countersUnitId = unitListsChildWorkplaces
    ? childWorkplacesLoading
      ? null
      : hasWorkplaceChildren
        ? selectedWorkplaceId
        : unitId
    : unitId;

  const countersQueryEnabled = Boolean(
    countersUnitId && (!unitListsChildWorkplaces || !childWorkplacesLoading)
  );

  const serviceZonePickerMode =
    unitListsChildWorkplaces && !childWorkplacesLoading && hasWorkplaceChildren;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['shift-dashboard', unitId],
    queryFn: () => shiftApi.getDashboard(unitId),
    refetchInterval: 10000
  });

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ['shift-queue', unitId],
    queryFn: () => shiftApi.getQueue(unitId),
    refetchInterval: 10000
  });

  const { data: counters, isLoading: countersLoading } = useQuery({
    queryKey: ['shift-counters', countersUnitId],
    queryFn: () => shiftApi.getCounters(countersUnitId!),
    refetchInterval: 10000,
    enabled: Boolean(countersUnitId && countersQueryEnabled)
  });

  const forceReleaseMutation = useMutation({
    mutationFn: (counterId: string) => shiftApi.forceReleaseCounter(counterId),
    onSuccess: () => {
      toast.success(t('counterReleased'));
      queryClient.invalidateQueries({ queryKey: ['shift-counters'] });
      queryClient.invalidateQueries({ queryKey: ['shift-activity'] });
      queryClient.invalidateQueries({ queryKey: ['shift-dashboard', unitId] });
      queryClient.removeQueries({ queryKey: ['staff-workstation-bootstrap'] });
      setForceReleaseDialogOpen(false);
      setSelectedCounter(null);
    },
    onError: (error: Error) => {
      toast.error(`${t('errorReleasingCounter')}: ${error.message}`);
    }
  });

  const eodMutation = useMutation({
    mutationFn: () => shiftApi.executeEOD(unitId),
    onSuccess: (data) => {
      const closed = Number(data.activeTicketsClosed ?? 0);
      const noShow = Number(data.waitingTicketsNoShow ?? 0);
      const released = Number(data.countersReleased ?? 0);
      toast.success(
        `${t('eodSuccess')}: ${closed} ${t('ticketsClosed')}, ${noShow} ${t('ticketsNoShow')}, ${released} ${t('countersReleased')}`
      );
      queryClient.invalidateQueries({ queryKey: ['shift-dashboard', unitId] });
      queryClient.invalidateQueries({ queryKey: ['shift-queue', unitId] });
      queryClient.invalidateQueries({ queryKey: ['shift-counters'] });
      queryClient.invalidateQueries({ queryKey: ['shift-activity'] });
      setShowEODDialog(false);
    },
    onError: (error: Error) => {
      toast.error(`${t('errorEOD')}: ${error.message}`);
    }
  });

  const handleForceRelease = (counter: ShiftCounterRow) => {
    setSelectedCounter({ id: counter.id, name: counter.name });
    setForceReleaseDialogOpen(true);
  };

  const confirmForceRelease = () => {
    if (selectedCounter) {
      forceReleaseMutation.mutate(selectedCounter.id);
    }
  };

  const counterRows: ShiftCounterRow[] | undefined = counters?.map((c) => ({
    id: c.id,
    name: c.name,
    isOccupied: c.isOccupied,
    onBreak: c.onBreak,
    sessionState: c.sessionState,
    assignedUser: c.assignedUser,
    activeTicket: c.activeTicket,
    breakStartedAt: c.breakStartedAt ?? null
  }));

  return (
    <>
      {activeSlaAlerts.length > 0 && (
        <div className='container mx-auto max-w-7xl px-4 pt-4'>
          <SlaAlertBanner
            alerts={activeSlaAlerts}
            onDismiss={dismissAlert}
            onDismissAll={dismissAllAlerts}
          />
        </div>
      )}
      <SupervisorShiftDashboard
        unitName={unit ? getUnitDisplayName(unit, locale) : undefined}
        stats={stats}
        statsLoading={statsLoading}
        queue={queue}
        queueLoading={queueLoading}
        counters={counterRows}
        countersLoading={countersLoading}
        onEod={() => setShowEODDialog(true)}
        eodPending={eodMutation.isPending}
        onForceRelease={handleForceRelease}
        forceReleasePending={forceReleaseMutation.isPending}
        onShowTicketDetails={openDetails}
        serviceZoneMode={serviceZonePickerMode}
        workplaceZones={
          serviceZonePickerMode
            ? (childWorkplaces ?? []).map((u) => ({
                id: u.id,
                name: getUnitDisplayName(u, locale)
              }))
            : undefined
        }
        workplacesLoading={Boolean(
          unitListsChildWorkplaces && childWorkplacesLoading
        )}
        selectedWorkplaceId={serviceZonePickerMode ? selectedWorkplaceId : null}
        onWorkplaceChange={setWorkplaceTabId}
        dashboardUnitId={unitId}
        activityUnitId={countersUnitId}
        activityQueryEnabled={countersQueryEnabled}
      />

      <Dialog
        open={forceReleaseDialogOpen}
        onOpenChange={setForceReleaseDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmForceRelease')}</DialogTitle>
            <DialogDescription>
              {t('forceReleaseWarning', {
                counterName: selectedCounter?.name || ''
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setForceReleaseDialogOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={confirmForceRelease}
              disabled={forceReleaseMutation.isPending}
            >
              {forceReleaseMutation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  {t('processing')}
                </>
              ) : (
                t('confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEODDialog} onOpenChange={setShowEODDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='text-destructive h-5 w-5' />
              {t('confirmEOD')}
            </DialogTitle>
            <DialogDescription className='space-y-2' asChild>
              <div>
                <div>{t('eodWarning')}</div>
                <ul className='list-inside list-disc space-y-1 text-sm'>
                  <li>{t('eodStep1')}</li>
                  <li>{t('eodStep2')}</li>
                  <li>{t('eodStep3')}</li>
                  <li>{t('eodStep4')}</li>
                </ul>
                <div className='text-destructive font-semibold'>
                  {t('eodIrreversible')}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setShowEODDialog(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={() => eodMutation.mutate()}
              disabled={eodMutation.isPending}
            >
              {eodMutation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  {t('processing')}
                </>
              ) : (
                t('executeEOD')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PreRegistrationDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        ticket={detailsTicket}
      />
    </>
  );
}
