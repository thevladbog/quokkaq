'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useLocale, useTranslations } from 'next-intl';
import { Coffee, Loader2, LogOut } from 'lucide-react';
import { useLiveElapsedSecondsSince } from '@/lib/use-live-elapsed-since';
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
  onBreak?: boolean;
  sessionState?: 'off_duty' | 'idle' | 'serving' | 'break';
  assignedUser?: { name: string };
  activeTicket?: Ticket | null;
  /** ISO time when current break interval started (from API). */
  breakStartedAt?: string | null;
};

function isCounterOnBreak(counter: ShiftCounterRow): boolean {
  return (
    counter.isOccupied &&
    (counter.sessionState === 'break' || counter.onBreak === true)
  );
}

export type SupervisorWorkplaceZone = {
  id: string;
  name: string;
};

function stationStatusDotClass(
  counter: ShiftCounterRow,
  ticket: Ticket | null | undefined
): string {
  if (!counter.isOccupied) return 'bg-muted-foreground';
  if (counter.sessionState === 'break' || counter.onBreak) return 'bg-sky-500';
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

function ticketVisitorDisplayName(ticket: Ticket): string | null {
  const c = ticket.client;
  if (c && !c.isAnonymous) {
    const name = [c.firstName, c.lastName]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
      .join(' ');
    if (name.length > 0) return name;
  }
  const pr = ticket.preRegistration;
  if (pr) {
    const name = [pr.customerFirstName, pr.customerLastName]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
      .join(' ');
    if (name.length > 0) return name;
  }
  return null;
}

/** Active ticket from shift API preloads `service` with localized names. */
function ticketServiceDisplayName(
  ticket: Ticket,
  locale: string
): string | null {
  const raw = ticket.service as
    | { name?: string; nameRu?: string | null; nameEn?: string | null }
    | undefined;
  if (!raw) return null;
  if (locale === 'ru' && raw.nameRu?.trim()) return raw.nameRu.trim();
  if (locale === 'en' && raw.nameEn?.trim()) return raw.nameEn.trim();
  const n = raw.name?.trim();
  return n && n.length > 0 ? n : null;
}

function stationStatusLabel(
  t: (key: string) => string,
  counter: ShiftCounterRow,
  ticket: Ticket | null | undefined
): string {
  if (!counter.isOccupied) return t('stationStatusDowntime');
  if (isCounterOnBreak(counter)) return t('statusOnBreak');
  if (!ticket) return t('statusIdleAtDesk');
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
  const locale = useLocale();
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
  const visitorName = ticket ? ticketVisitorDisplayName(ticket) : null;
  const serviceName = ticket ? ticketServiceDisplayName(ticket, locale) : null;

  const onBreak = isCounterOnBreak(counter);
  const breakElapsedSec = useLiveElapsedSecondsSince(
    onBreak ? (counter.breakStartedAt ?? null) : null
  );

  return (
    <Card
      className={cn(
        'gap-1.5 overflow-hidden rounded-2xl py-3 shadow-sm',
        longDuration && 'border-destructive/60 shadow-sm',
        onBreak &&
          'border-amber-300/70 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/25'
      )}
    >
      <CardHeader className='px-4 pt-0 pb-0'>
        <div className='flex w-full min-w-0 flex-col gap-0.5 overflow-hidden'>
          <div className='flex w-full min-w-0 items-center gap-2'>
            <CardTitle className='min-w-0 shrink truncate text-base leading-tight'>
              {counter.name}
            </CardTitle>
            {counter.isOccupied ? (
              <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>
                <Avatar size='sm' className='ring-border shrink-0 ring-1'>
                  <AvatarFallback className='text-[0.65rem]'>
                    {operatorInitials(
                      counter.assignedUser?.name || t('unknownOperator')
                    )}
                  </AvatarFallback>
                </Avatar>
                <p
                  className='text-foreground max-w-[min(12rem,40vw)] min-w-0 truncate text-right text-sm font-medium sm:max-w-[14rem]'
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
          <div className='text-muted-foreground flex min-w-0 items-center gap-2 text-sm'>
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)}
              aria-hidden
            />
            <span className='min-w-0 truncate'>{statusText}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-2 px-4 pt-0 pb-3'>
        {onBreak ? (
          <div
            className={cn(
              'flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center',
              'border-amber-400/50 bg-amber-100/30 dark:border-amber-700/50 dark:bg-amber-950/30'
            )}
          >
            <Coffee
              className='h-10 w-10 text-amber-900/70 dark:text-amber-200/80'
              strokeWidth={1.5}
            />
            <p className='text-foreground mt-3 text-base font-semibold'>
              {t('counterBreakTitle')}
            </p>
            <p className='text-muted-foreground mt-1.5 text-[0.65rem] font-semibold tracking-[0.12em] uppercase'>
              {t('counterBreakElapsedLabel')}{' '}
              {formatWaitDurationSeconds(breakElapsedSec)}
            </p>
          </div>
        ) : ticket ? (
          <>
            <div
              className={cn(
                'bg-muted/50 isolate space-y-1.5 rounded-xl border border-transparent p-2.5',
                longDuration &&
                  'border-destructive/40 bg-destructive/5 dark:bg-destructive/10'
              )}
            >
              <div className='flex flex-wrap items-center justify-between gap-1.5'>
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
              <div className='relative z-10 mt-0.5 space-y-0.5'>
                <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
                  <p
                    className={cn(
                      'inline-block rounded-md px-1.5 py-1 text-2xl leading-none font-bold tracking-tight tabular-nums',
                      longDuration &&
                        'bg-destructive/10 text-destructive ring-destructive/20 ring-1'
                    )}
                  >
                    {ticket.queueNumber}
                  </p>
                  {visitorName ? (
                    <p
                      className='text-foreground max-w-full min-w-0 flex-1 truncate text-sm font-semibold sm:text-base'
                      title={visitorName}
                    >
                      {visitorName}
                    </p>
                  ) : null}
                </div>
                {serviceName ? (
                  <p
                    className='text-muted-foreground max-w-full pl-1.5 text-sm leading-tight'
                    title={serviceName}
                  >
                    {serviceName}
                  </p>
                ) : null}
              </div>
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div>
                <p className='text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase'>
                  {t('counterWaitTimeLabel')}
                </p>
                <p className='mt-0.5 text-lg leading-tight font-semibold tabular-nums'>
                  {waitDisplay}
                </p>
              </div>
              <div>
                <p className='text-muted-foreground text-[0.65rem] font-semibold tracking-wider uppercase'>
                  {t('counterDurationLabel')}
                </p>
                <p
                  className={cn(
                    'mt-0.5 text-lg leading-tight font-semibold tabular-nums',
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
                className='mt-0 h-1.5 shrink-0'
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
            {t('statusIdleAtDesk')}
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
  const locale = useLocale();
  const ticket = counter.activeTicket;

  const durationTimer = useTicketTimer(
    ticket?.status === 'in_service' && ticket.confirmedAt
      ? ticket.confirmedAt
      : undefined,
    undefined
  );

  const visitorName = ticket ? ticketVisitorDisplayName(ticket) : null;
  const serviceName = ticket ? ticketServiceDisplayName(ticket, locale) : null;

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
  const onBreak = isCounterOnBreak(counter);
  const breakElapsedSec = useLiveElapsedSecondsSince(
    onBreak ? (counter.breakStartedAt ?? null) : null
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between',
        longDuration && 'border-destructive/50 bg-destructive/[0.03]',
        onBreak &&
          'border-amber-300/70 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20'
      )}
    >
      <div className='flex min-w-0 flex-1 items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
            <span className='font-semibold'>{counter.name}</span>
            {counter.isOccupied ? (
              <>
                <span
                  className='text-muted-foreground/60 hidden sm:inline'
                  aria-hidden
                >
                  ·
                </span>
                <div className='flex max-w-full min-w-0 items-center gap-1.5'>
                  <Avatar size='sm' className='ring-border shrink-0 ring-1'>
                    <AvatarFallback className='text-[0.65rem]'>
                      {operatorInitials(
                        counter.assignedUser?.name || t('unknownOperator')
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className='text-foreground max-w-[min(14rem,55vw)] truncate text-sm font-medium'
                    title={counter.assignedUser?.name || t('unknownOperator')}
                  >
                    {counter.assignedUser?.name || t('unknownOperator')}
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <div className='text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)}
            />
            <span>{statusText}</span>
            {ticket && !onBreak ? (
              <>
                <span className='text-muted-foreground/60'>·</span>
                <span className='font-medium tabular-nums'>
                  {ticket.queueNumber}
                </span>
                {visitorName ? (
                  <>
                    <span className='text-muted-foreground/60'>·</span>
                    <span className='max-w-[12rem] truncate font-medium'>
                      {visitorName}
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          {onBreak ? (
            <div className='text-foreground mt-2 flex flex-wrap items-center gap-2 text-sm'>
              <Coffee
                className='h-4 w-4 shrink-0 text-amber-900/70 dark:text-amber-200/80'
                strokeWidth={1.5}
              />
              <span className='font-semibold'>{t('counterBreakTitle')}</span>
              <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                {t('counterBreakElapsedLabel')}{' '}
                {formatWaitDurationSeconds(breakElapsedSec)}
              </span>
            </div>
          ) : null}
          {serviceName && !onBreak ? (
            <p
              className='text-muted-foreground mt-0.5 max-w-full truncate text-xs'
              title={serviceName}
            >
              {serviceName}
            </p>
          ) : null}
          {ticket && !onBreak ? (
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
        <div className='flex shrink-0 self-start sm:self-center'>
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
  const zoneIdsKey = JSON.stringify(zones.map((z) => z.id));
  const firstZoneId = zones[0]?.id;

  const effectiveWorkplaceId = useMemo(() => {
    if (!zonesListReady || zones.length === 0 || firstZoneId == null) {
      return selectedWorkplaceId && selectedWorkplaceId !== ''
        ? selectedWorkplaceId
        : undefined;
    }
    const ids: string[] = JSON.parse(zoneIdsKey) as string[];
    const inList =
      selectedWorkplaceId != null &&
      selectedWorkplaceId !== '' &&
      ids.includes(selectedWorkplaceId);
    return inList ? selectedWorkplaceId! : firstZoneId;
  }, [
    zonesListReady,
    zoneIdsKey,
    firstZoneId,
    zones.length,
    selectedWorkplaceId
  ]);

  useEffect(() => {
    if (
      !zonesListReady ||
      zones.length === 0 ||
      !onWorkplaceChange ||
      !firstZoneId
    )
      return;
    const ids: string[] = JSON.parse(zoneIdsKey) as string[];
    const inList =
      selectedWorkplaceId != null &&
      selectedWorkplaceId !== '' &&
      ids.includes(selectedWorkplaceId);
    if (inList) return;
    onWorkplaceChange(firstZoneId);
  }, [
    zonesListReady,
    zoneIdsKey,
    firstZoneId,
    zones.length,
    selectedWorkplaceId,
    onWorkplaceChange
  ]);

  const zoneSelectionPending =
    zonesListReady && zones.length > 0 && effectiveWorkplaceId == null;

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
                value={effectiveWorkplaceId ?? '__none__'}
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
