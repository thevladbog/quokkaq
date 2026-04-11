'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { Loader2, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  formatMetricSecondsOrDash,
  formatWaitDurationSeconds,
  SUPERVISOR_LONG_SERVICE_SEC,
  ticketPreCallWaitSeconds
} from './supervisor-queue-utils';
import { useTicketTimer } from '@/lib/ticket-timer';

export type ShiftCounterRow = {
  id: string;
  name: string;
  isOccupied: boolean;
  assignedUser?: { name: string };
  activeTicket?: Ticket | null;
};

export type SupervisorWorkplaceZone = {
  id: string;
  name: string;
};

function stationStatusDotClass(
  counter: ShiftCounterRow,
  ticket: Ticket | null | undefined
): string {
  if (!counter.isOccupied) return 'bg-muted-foreground';
  if (!ticket) return 'bg-amber-500';
  if (ticket.status === 'called') return 'bg-amber-500';
  if (ticket.status === 'in_service') return 'bg-green-600';
  return 'bg-muted-foreground';
}

function operatorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const a = parts[0][0] ?? '';
  const b = parts[parts.length - 1][0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function stationStatusLabel(
  t: (key: string) => string,
  counter: ShiftCounterRow,
  ticket: Ticket | null | undefined
): string {
  if (!counter.isOccupied) return t('stationStatusDowntime');
  if (!ticket) return t('statusNoActiveTicket');
  if (ticket.status === 'called') return t('ticketStatusCalling');
  if (ticket.status === 'in_service') return t('ticketStatusInService');
  return t('statusOnline');
}

function WorkstationCard({
  counter,
  onRelease,
  releasePending
}: {
  counter: ShiftCounterRow;
  onRelease: (c: ShiftCounterRow) => void;
  releasePending: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const ticket = counter.activeTicket;
  const idleFree = !counter.isOccupied;
  const occupiedNoTicket = counter.isOccupied && ticket == null;

  const serviceTimer = useTicketTimer(
    ticket?.status === 'in_service' && ticket.confirmedAt
      ? ticket.confirmedAt
      : undefined,
    ticket?.status === 'in_service' && ticket.service?.duration
      ? ticket.service.duration
      : undefined
  );

  const waitSec = ticket ? ticketPreCallWaitSeconds(ticket) : null;
  const waitDisplay = formatMetricSecondsOrDash(
    waitSec,
    t('counterMetricEmpty')
  );

  const inService = ticket?.status === 'in_service';
  const durationDisplay = inService
    ? formatWaitDurationSeconds(serviceTimer.elapsed)
    : t('counterMetricEmpty');

  const longDuration =
    ticket != null &&
    inService &&
    serviceTimer.elapsed >= SUPERVISOR_LONG_SERVICE_SEC;

  const priority = Boolean(ticket?.preRegistration);
  const showProgress =
    inService &&
    ticket.service?.duration != null &&
    ticket.service.duration > 0;

  const dotClass = stationStatusDotClass(counter, ticket);
  const statusText = stationStatusLabel(t, counter, ticket);

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl',
        longDuration && 'border-destructive/60 shadow-sm'
      )}
    >
      <CardHeader className='pb-2'>
        <div className='flex w-full min-w-0 flex-col gap-3 overflow-hidden'>
          <div className='min-w-0'>
            <CardTitle className='truncate text-base leading-tight'>
              {counter.name}
            </CardTitle>
            <div className='text-muted-foreground mt-1.5 flex min-w-0 items-center gap-2 text-sm'>
              <span
                className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)}
                aria-hidden
              />
              <span className='min-w-0 truncate'>{statusText}</span>
            </div>
          </div>
          {counter.isOccupied ? (
            <div className='border-border/60 flex w-full min-w-0 items-center justify-end gap-2 border-t pt-3'>
              <Avatar size='sm' className='ring-border shrink-0 ring-1'>
                <AvatarFallback className='text-[0.65rem]'>
                  {operatorInitials(
                    counter.assignedUser?.name || t('unknownOperator')
                  )}
                </AvatarFallback>
              </Avatar>
              <p
                className='text-foreground min-w-0 flex-1 truncate text-right text-sm font-medium'
                title={counter.assignedUser?.name || t('unknownOperator')}
              >
                {counter.assignedUser?.name || t('unknownOperator')}
              </p>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='text-muted-foreground shrink-0'
                onClick={() => onRelease(counter)}
                disabled={releasePending}
                aria-label={t('forceReleaseAria')}
              >
                <LogOut className='h-4 w-4' />
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='space-y-4 pt-0'>
        {ticket ? (
          <>
            <div
              className={cn(
                'bg-muted/50 isolate space-y-2 rounded-2xl border border-transparent p-3',
                longDuration &&
                  'border-destructive/40 bg-destructive/5 dark:bg-destructive/10'
              )}
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p
                  className={cn(
                    'text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase',
                    longDuration && 'text-destructive font-bold'
                  )}
                >
                  {longDuration
                    ? t('activeTicketWarningLabel')
                    : t('activeTicketSectionLabel')}
                </p>
                <div className='flex flex-wrap justify-end gap-1.5'>
                  {priority ? (
                    <Badge variant='outline' className='text-xs'>
                      {t('badgePriority')}
                    </Badge>
                  ) : null}
                  {longDuration ? (
                    <Badge variant='destructive' className='text-xs'>
                      {t('badgeLongDuration')}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <p
                className={cn(
                  'relative z-10 mt-1 inline-block rounded-lg px-2 py-1.5 text-2xl font-bold tracking-tight tabular-nums',
                  longDuration &&
                    'bg-destructive/10 text-destructive ring-destructive/20 ring-1'
                )}
              >
                {ticket.queueNumber}
              </p>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div>
                <p className='text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase'>
                  {t('counterWaitTimeLabel')}
                </p>
                <p className='mt-1 text-lg font-semibold tabular-nums'>
                  {waitDisplay}
                </p>
              </div>
              <div>
                <p className='text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase'>
                  {t('counterDurationLabel')}
                </p>
                <p
                  className={cn(
                    'mt-1 text-lg font-semibold tabular-nums',
                    longDuration && 'text-destructive'
                  )}
                >
                  {durationDisplay}
                </p>
              </div>
            </div>

            {showProgress ? (
              <Progress
                value={Math.min(100, serviceTimer.percent)}
                className='mt-1 h-1.5 shrink-0'
                indicatorClassName={
                  serviceTimer.percent >= 100 ? 'bg-destructive' : 'bg-primary'
                }
              />
            ) : null}
          </>
        ) : idleFree ? (
          <p className='text-muted-foreground text-sm'>{t('noActiveTicket')}</p>
        ) : occupiedNoTicket ? (
          <p className='text-muted-foreground text-sm'>
            {t('statusNoActiveTicket')}
          </p>
        ) : (
          <p className='text-muted-foreground text-sm'>{t('noActiveTicket')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function WorkstationListRow({
  counter,
  onRelease,
  releasePending
}: {
  counter: ShiftCounterRow;
  onRelease: (c: ShiftCounterRow) => void;
  releasePending: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const ticket = counter.activeTicket;

  const durationTimer = useTicketTimer(
    ticket?.status === 'in_service' && ticket.confirmedAt
      ? ticket.confirmedAt
      : undefined,
    undefined
  );

  const waitSec = ticket ? ticketPreCallWaitSeconds(ticket) : null;
  const waitDisplay = formatMetricSecondsOrDash(
    waitSec,
    t('counterMetricEmpty')
  );
  const durationDisplay =
    ticket?.status === 'in_service'
      ? formatWaitDurationSeconds(durationTimer.elapsed)
      : t('counterMetricEmpty');

  const longDuration =
    ticket != null &&
    ticket.status === 'in_service' &&
    durationTimer.elapsed >= SUPERVISOR_LONG_SERVICE_SEC;

  const dotClass = stationStatusDotClass(counter, ticket);
  const statusText = stationStatusLabel(t, counter, ticket);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between',
        longDuration && 'border-destructive/50 bg-destructive/[0.03]'
      )}
    >
      <div className='flex min-w-0 flex-1 items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='font-semibold'>{counter.name}</div>
          <div className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)}
            />
            <span>{statusText}</span>
            {ticket ? (
              <>
                <span className='text-muted-foreground/60'>·</span>
                <span className='font-medium tabular-nums'>
                  {ticket.queueNumber}
                </span>
              </>
            ) : null}
          </div>
          {ticket ? (
            <div className='text-muted-foreground mt-1.5 text-xs tabular-nums'>
              <span>
                {t('counterWaitTimeLabel')}: {waitDisplay}
              </span>
              <span className='mx-1.5'>·</span>
              <span
                className={cn(
                  longDuration &&
                    ticket.status === 'in_service' &&
                    'text-destructive font-medium'
                )}
              >
                {t('counterDurationLabel')}: {durationDisplay}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {counter.isOccupied ? (
        <div className='flex shrink-0 items-center gap-2 self-start sm:self-center'>
          <Avatar size='sm' className='ring-border ring-1'>
            <AvatarFallback className='text-[0.65rem]'>
              {operatorInitials(
                counter.assignedUser?.name || t('unknownOperator')
              )}
            </AvatarFallback>
          </Avatar>
          <p
            className='text-foreground max-w-[10rem] truncate text-sm font-medium'
            title={counter.assignedUser?.name || t('unknownOperator')}
          >
            {counter.assignedUser?.name || t('unknownOperator')}
          </p>
          <Button
            variant='outline'
            size='sm'
            className='shrink-0'
            onClick={() => onRelease(counter)}
            disabled={releasePending}
          >
            <LogOut className='mr-2 h-4 w-4' />
            {t('forceRelease')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SupervisorWorkstationMonitoring({
  counters,
  countersLoading,
  onForceRelease,
  releasePending,
  serviceZoneMode,
  workplaceZones,
  selectedWorkplaceId,
  onWorkplaceChange,
  workplacesLoading
}: {
  counters: ShiftCounterRow[] | undefined;
  countersLoading: boolean;
  onForceRelease: (counter: ShiftCounterRow) => void;
  releasePending: boolean;
  /** True when the dashboard unit is a service zone (child workplaces listed below). */
  serviceZoneMode?: boolean;
  /** Resolved child workplaces; omit while `workplacesLoading` so empty ≠ “no data yet”. */
  workplaceZones?: SupervisorWorkplaceZone[];
  selectedWorkplaceId?: string | null;
  onWorkplaceChange?: (id: string) => void;
  workplacesLoading?: boolean;
}) {
  const t = useTranslations('supervisor.dashboardUi');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const list = counters ?? [];

  const showZonePicker = Boolean(serviceZoneMode);
  const zonesListReady =
    showZonePicker && !workplacesLoading && workplaceZones != null;
  const zones = workplaceZones ?? [];
  const zonesEmpty = zonesListReady && zones.length === 0;
  const zoneSelectionPending =
    zonesListReady &&
    zones.length > 0 &&
    (selectedWorkplaceId == null || selectedWorkplaceId === '');

  return (
    <Card data-testid='e2e-supervisor-workstation-monitoring'>
      <CardHeader className='flex flex-col gap-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle>{t('monitoringTitle')}</CardTitle>
            <CardDescription>{t('monitoringDescription')}</CardDescription>
          </div>
          <Tabs
            value={layout}
            onValueChange={(v) => setLayout(v as 'grid' | 'list')}
          >
            <TabsList className='shrink-0'>
              <TabsTrigger value='grid'>{t('viewGrid')}</TabsTrigger>
              <TabsTrigger value='list'>{t('viewList')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {showZonePicker ? (
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('zonePickerLabel')}
            </p>
            {workplacesLoading ? (
              <div className='flex items-center gap-2 py-2'>
                <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
                <span className='text-muted-foreground text-sm'>
                  {t('zonesLoading')}
                </span>
              </div>
            ) : zonesEmpty ? (
              <p className='text-muted-foreground text-sm'>{t('zonesEmpty')}</p>
            ) : zones.length > 0 ? (
              <Tabs
                value={selectedWorkplaceId ?? zones[0]?.id ?? '__none__'}
                onValueChange={(id) => onWorkplaceChange?.(id)}
              >
                <TabsList
                  className={cn(
                    'h-auto w-full min-w-0 flex-wrap justify-start gap-1 p-1'
                  )}
                >
                  {zones.map((z) => (
                    <TabsTrigger
                      key={z.id}
                      value={z.id}
                      className='max-w-full shrink-0 px-3 py-1.5 text-xs sm:text-sm'
                    >
                      <span className='truncate' title={z.name}>
                        {z.name}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {zonesEmpty ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            {t('zonesEmptyDetail')}
          </p>
        ) : showZonePicker && workplacesLoading ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='text-muted-foreground h-10 w-10 animate-spin' />
          </div>
        ) : zoneSelectionPending ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='text-muted-foreground h-10 w-10 animate-spin' />
          </div>
        ) : countersLoading ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='h-10 w-10 animate-spin' />
          </div>
        ) : list.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {t('noCounters')}
          </p>
        ) : layout === 'grid' ? (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
            {list.map((c) => (
              <WorkstationCard
                key={c.id}
                counter={c}
                onRelease={onForceRelease}
                releasePending={releasePending}
              />
            ))}
          </div>
        ) : (
          <div className='space-y-2'>
            {list.map((c) => (
              <WorkstationListRow
                key={c.id}
                counter={c}
                onRelease={onForceRelease}
                releasePending={releasePending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
