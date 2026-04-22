'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Ticket, Service } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle, Bug } from 'lucide-react';
import { Link } from '@/src/i18n/navigation';
import { SupervisorKpiRow } from './SupervisorKpiRow';
import { SupervisorQueueStrip } from './SupervisorQueueStrip';
import {
  SupervisorWorkstationMonitoring,
  type ShiftCounterRow,
  type SupervisorWorkplaceZone
} from './SupervisorWorkstationMonitoring';
import { SupervisorRecentActivity } from './SupervisorRecentActivity';
import { SupervisorShiftSnapshot } from './SupervisorShiftSnapshot';
import { SupervisorListView } from './SupervisorListView';
import { SupervisorTimelineView } from './SupervisorTimelineView';

type DashboardStats = {
  activeCountersCount: number;
  queueLength: number;
  averageWaitTimeMinutes: number;
};

export function SupervisorShiftDashboard({
  unitName,
  stats,
  statsLoading,
  queue,
  queueLoading,
  counters,
  countersLoading,
  onEod,
  eodPending,
  onForceRelease,
  forceReleasePending,
  onShowTicketDetails,
  serviceZoneMode,
  workplaceZones,
  selectedWorkplaceId,
  onWorkplaceChange,
  workplacesLoading,
  dashboardUnitId,
  activityUnitId,
  activityQueryEnabled
}: {
  unitName: string | undefined;
  stats: DashboardStats | undefined;
  statsLoading: boolean;
  queue: (Ticket & { service?: Service })[] | undefined;
  queueLoading: boolean;
  counters: ShiftCounterRow[] | undefined;
  countersLoading: boolean;
  onEod: () => void;
  eodPending: boolean;
  onForceRelease: (counter: ShiftCounterRow) => void;
  forceReleasePending: boolean;
  onShowTicketDetails: (ticket: Ticket & { service?: Service }) => void;
  serviceZoneMode?: boolean;
  workplaceZones?: SupervisorWorkplaceZone[];
  selectedWorkplaceId?: string | null;
  onWorkplaceChange?: (id: string) => void;
  workplacesLoading?: boolean;
  /** Route unit id (URL segment) for links to journal. */
  dashboardUnitId: string;
  /** Unit id for activity API (matches counters scope). */
  activityUnitId: string | null;
  activityQueryEnabled: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const tStaffSupport = useTranslations('staff.support');
  const totalCounters = counters?.length ?? 0;

  return (
    <div
      className='container mx-auto max-w-7xl space-y-6 p-4'
      data-testid='e2e-supervisor-shift-dashboard'
    >
      <Tabs defaultValue='live' className='gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('eyebrow')}
            </p>
            <h1 className='text-3xl font-bold'>{t('pageTitle')}</h1>
            <p className='text-muted-foreground'>{unitName ?? '…'}</p>
          </div>
          <div className='flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end'>
            <Button variant='outline' asChild className='h-8 shrink-0'>
              <Link href='/staff/support'>
                <Bug className='mr-2 h-4 w-4' aria-hidden />
                {tStaffSupport('sidebarSupport')}
              </Link>
            </Button>
            <TabsList className='grid h-8 w-full grid-cols-3 sm:inline-flex sm:w-auto'>
              <TabsTrigger value='live' className='h-full'>
                {t('viewLive')}
              </TabsTrigger>
              <TabsTrigger value='list' className='h-full'>
                {t('viewListGlobal')}
              </TabsTrigger>
              <TabsTrigger value='timeline' className='h-full'>
                {t('viewTimeline')}
              </TabsTrigger>
            </TabsList>
            <Button
              variant='destructive'
              className='h-8 shrink-0'
              onClick={onEod}
              disabled={eodPending}
            >
              {eodPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  {t('processing')}
                </>
              ) : (
                <>
                  <AlertTriangle className='mr-2 h-4 w-4' />
                  {t('endOfDay')}
                </>
              )}
            </Button>
          </div>
        </div>

        <TabsContent value='live' className='space-y-6'>
          <SupervisorKpiRow
            stats={stats}
            statsLoading={statsLoading}
            totalCounters={totalCounters}
          />
          <SupervisorQueueStrip queue={queue} queueLoading={queueLoading} />
          <SupervisorWorkstationMonitoring
            counters={counters}
            countersLoading={countersLoading}
            onForceRelease={onForceRelease}
            releasePending={forceReleasePending}
            serviceZoneMode={serviceZoneMode}
            workplaceZones={workplaceZones}
            selectedWorkplaceId={selectedWorkplaceId}
            onWorkplaceChange={onWorkplaceChange}
            workplacesLoading={workplacesLoading}
          />
          <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
            <SupervisorRecentActivity
              dashboardUnitId={dashboardUnitId}
              activityUnitId={activityUnitId}
              queryEnabled={activityQueryEnabled}
            />
            <SupervisorShiftSnapshot
              stats={stats}
              statsLoading={statsLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value='list'>
          <SupervisorListView
            queue={queue}
            queueLoading={queueLoading}
            counters={counters}
            countersLoading={countersLoading}
            onShowTicketDetails={onShowTicketDetails}
            onForceRelease={onForceRelease}
            releasePending={forceReleasePending}
          />
        </TabsContent>

        <TabsContent value='timeline'>
          <SupervisorTimelineView queue={queue} queueLoading={queueLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
