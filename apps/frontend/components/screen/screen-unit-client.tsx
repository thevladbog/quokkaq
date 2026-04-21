'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import {
  formatAppDate,
  formatAppTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { getGetUnitsUnitIdTicketsQueryKey } from '@/lib/api/generated/tickets-counters';
import { Ticket, unitsApi, Material, UnitConfig } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTickets, useUnit } from '@/lib/hooks';
import { socketClient } from '@/lib/socket';
import { AdPlayer } from '@/components/screen/ad-player';
import { CalledTicketsTable } from '@/components/screen/called-tickets-table';
import { QueueTicker } from '@/components/screen/queue-ticker';
import { Spinner } from '@/components/ui/spinner';
import { getUnitDisplayName } from '@/lib/unit-display';

interface ScreenUnitClientProps {
  unitId: string;
}

const EMPTY_TICKET_LIST: Ticket[] = [];

function deriveCalledTicketsForScreen(tickets: Ticket[]): Ticket[] {
  const activePool = tickets.filter(
    (t) =>
      t.status === 'called' ||
      t.status === 'in_service' ||
      t.status === 'served' ||
      t.status === 'completed'
  );
  const statusRank = (s: string) =>
    s === 'called'
      ? 3
      : s === 'in_service'
        ? 2
        : s === 'served' || s === 'completed'
          ? 1
          : 0;
  const byCounter = new Map<string, Ticket[]>();
  for (const tick of activePool) {
    const key = tick.counter?.id ?? `no-counter:${tick.id}`;
    const list = byCounter.get(key);
    if (list) list.push(tick);
    else byCounter.set(key, [tick]);
  }
  const out: Ticket[] = [];
  for (const group of byCounter.values()) {
    group.sort((a, b) => {
      const dr = statusRank(b.status) - statusRank(a.status);
      if (dr !== 0) return dr;
      return (
        new Date(b.calledAt || 0).getTime() -
        new Date(a.calledAt || 0).getTime()
      );
    });
    const winner = group[0];
    if (winner) out.push(winner);
  }
  out.sort((a, b) => {
    const dr = statusRank(b.status) - statusRank(a.status);
    if (dr !== 0) return dr;
    return (
      new Date(b.calledAt || 0).getTime() - new Date(a.calledAt || 0).getTime()
    );
  });
  return out;
}

export function ScreenUnitClient({ unitId }: ScreenUnitClientProps) {
  const t = useTranslations('screen');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const queryClient = useQueryClient();

  const ticketsQuery = useTickets(unitId, {
    enabled: !!unitId,
    refetchInterval: 12_000
  });
  const {
    data: ticketsData,
    isLoading: ticketsLoading,
    isPending: ticketsPending,
    isError: ticketsError
  } = ticketsQuery;

  const [currentTime, setCurrentTime] = useState(new Date());
  const [materials, setMaterials] = useState<Material[]>([]);

  // Use useUnit hook with polling
  const { data: unit, isLoading: isUnitLoading } = useUnit(unitId, {
    refetchInterval: 120000
  });

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const unitKind = unit?.kind;
  const unitParentId = unit?.parentId;

  // WebSocket room matches ticket.UnitID on the server (subdivision); URL may be a service_zone.
  useEffect(() => {
    if (!unitId || unitKind == null) return;

    const wsRoomId =
      unitKind === 'service_zone' && unitParentId ? unitParentId : unitId;

    const ticketsQueryKey = getGetUnitsUnitIdTicketsQueryKey(unitId);
    const wsDebounceRef = { t: null as ReturnType<typeof setTimeout> | null };

    const scheduleWsRefetch = () => {
      if (wsDebounceRef.t) {
        clearTimeout(wsDebounceRef.t);
      }
      wsDebounceRef.t = setTimeout(() => {
        wsDebounceRef.t = null;
        void queryClient.invalidateQueries({ queryKey: ticketsQueryKey });
      }, 80);
    };

    socketClient.connect(wsRoomId);

    const handleTicketUpdate = () => {
      scheduleWsRefetch();
    };

    const handleEOD = () => {
      logger.log('EOD event received, refreshing tickets');
      scheduleWsRefetch();
    };

    socketClient.onTicketCreated(handleTicketUpdate);
    socketClient.onTicketUpdated(handleTicketUpdate);
    socketClient.onTicketCalled(handleTicketUpdate);
    socketClient.onUnitEOD(handleEOD);

    return () => {
      if (wsDebounceRef.t) {
        clearTimeout(wsDebounceRef.t);
        wsDebounceRef.t = null;
      }
      socketClient.off('ticket.created', handleTicketUpdate);
      socketClient.off('ticket.updated', handleTicketUpdate);
      socketClient.off('ticket.called', handleTicketUpdate);
      socketClient.off('unit.eod', handleEOD);
      socketClient.disconnect();
    };
  }, [unitId, unitKind, unitParentId, queryClient]);

  // Fetch materials
  useEffect(() => {
    let isMounted = true;

    const fetchMaterials = async () => {
      try {
        const allMaterials = await unitsApi.getMaterials(unitId);
        if (isMounted && unit) {
          const config = unit.config as UnitConfig;
          const adConfig = config?.adScreen;
          const activeIds = adConfig?.activeMaterialIds || [];

          const filtered = allMaterials.filter((m: Material) =>
            activeIds.includes(m.id)
          );
          setMaterials(filtered);
        }
      } catch (error) {
        logger.error('Failed to fetch materials:', error);
      }
    };

    if (unit) {
      fetchMaterials();
    }

    const interval = setInterval(fetchMaterials, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [unitId, unit]);

  // Queue status for ETA display
  const [queueStatus, setQueueStatus] = useState<{
    queueLength: number;
    estimatedWaitMinutes: number;
    activeCounters: number;
    services?: Array<{
      serviceId: string;
      serviceName: string;
      queueLength: number;
      estimatedWaitMinutes: number;
    }>;
  } | null>(null);

  useEffect(() => {
    if (!unitId) return;
    const fetch = () => {
      unitsApi
        .getQueueStatus(unitId)
        .then(setQueueStatus)
        .catch(() => null);
    };
    fetch();
    const iv = setInterval(fetch, 30_000);
    return () => clearInterval(iv);
  }, [unitId]);

  if (isUnitLoading) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <Spinner className='h-12 w-12' />
      </div>
    );
  }

  if (!unit) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <h1 className='text-2xl'>{t('unitNotFound')}</h1>
      </div>
    );
  }

  if (ticketsLoading || ticketsPending) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <Spinner className='h-12 w-12' />
      </div>
    );
  }

  if (ticketsError) {
    return (
      <div className='bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center'>
        <p className='text-muted-foreground max-w-md text-lg'>
          {t('ticketsLoadError')}
        </p>
        <button
          type='button'
          className='text-primary text-sm font-medium underline underline-offset-4'
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: getGetUnitsUnitIdTicketsQueryKey(unitId)
            })
          }
        >
          {t('ticketsLoadRetry')}
        </button>
      </div>
    );
  }

  const tickets = ticketsData ?? EMPTY_TICKET_LIST;

  const calledTickets = deriveCalledTicketsForScreen(tickets);

  const waitingTickets = tickets
    .filter((t) => t.status === 'waiting')
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime()
    );

  const config = unit.config as UnitConfig;
  const adConfig = config?.adScreen;
  const showAds = adConfig && adConfig.width > 0 && materials.length > 0;
  const adWidth = adConfig?.width || 0;

  const virtualQueueEnabled =
    (config as { virtualQueue?: { enabled?: boolean } } | null)?.virtualQueue
      ?.enabled === true;
  const queueUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/${locale}/queue/${unitId}`
      : `/${locale}/queue/${unitId}`;

  // Custom colors
  const isCustomColorsEnabled = adConfig?.isCustomColorsEnabled || false;
  const headerColor = isCustomColorsEnabled ? adConfig?.headerColor || '' : '';
  const bodyColor = isCustomColorsEnabled ? adConfig?.bodyColor || '' : '';

  return (
    <div
      className='bg-background text-foreground flex h-screen w-screen flex-col overflow-hidden'
      style={{ backgroundColor: bodyColor || undefined }}
    >
      {/* Top Bar: Unit Name + Date/Time */}
      <div
        className='bg-card z-10 flex h-20 flex-none items-center justify-between border-b px-8 shadow-sm'
        style={{ backgroundColor: headerColor || undefined }}
      >
        <div className='flex items-center gap-4'>
          {(config?.adScreen?.logoUrl || config?.logoUrl) && (
            <div className='relative h-12 w-auto md:h-16'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config?.adScreen?.logoUrl || config?.logoUrl || ''}
                alt='Logo'
                className='h-full w-auto object-contain'
              />
            </div>
          )}
          <h1 className='text-primary text-4xl font-bold'>
            {getUnitDisplayName(unit, locale)}
          </h1>
        </div>
        <div className='text-right'>
          <div className='font-mono text-3xl font-bold'>
            {formatAppTime(currentTime, intlLocale)}
          </div>
          <div className='text-muted-foreground text-lg'>
            {formatAppDate(currentTime, intlLocale, 'full')}
          </div>
        </div>
      </div>

      {/* Main Content: Dynamic Layout */}
      <div
        className='flex flex-1 flex-col overflow-hidden landscape:flex-row'
        style={
          {
            '--ad-size': `${adWidth}%`
          } as React.CSSProperties
        }
      >
        {/* Ad Container */}
        {showAds && (
          <div className='bg-muted/10 order-2 h-[var(--ad-size)] w-full border-t p-4 landscape:order-1 landscape:h-full landscape:w-[var(--ad-size)] landscape:border-t-0 landscape:border-r'>
            <div className='relative h-full w-full'>
              <AdPlayer
                materials={materials}
                duration={adConfig.duration || 5}
              />
            </div>
          </div>
        )}

        {/* Tickets Container */}
        <div
          className={`bg-background order-1 p-0 landscape:order-2 ${showAds ? 'h-[calc(100%-var(--ad-size))] w-full landscape:h-full landscape:w-[calc(100%-var(--ad-size))]' : 'h-full w-full'}`}
        >
          <CalledTicketsTable
            tickets={calledTickets}
            backgroundColor={bodyColor}
            historyLimit={adConfig?.recentCallsHistoryLimit ?? 0}
          />
        </div>
      </div>

      {/* Bottom: ETA stats + QR */}
      {(queueStatus || virtualQueueEnabled) && (
        <div className='bg-card/90 z-20 flex flex-none items-center justify-between gap-6 border-t px-8 py-2'>
          {/* Queue stats */}
          {queueStatus && (
            <div className='flex flex-wrap items-center gap-4 text-sm'>
              {/* Per-service breakdown (when multiple services have waiting tickets) */}
              {queueStatus.services && queueStatus.services.length > 1 ? (
                queueStatus.services.map((svc) => (
                  <span
                    key={svc.serviceId}
                    className='bg-muted/60 flex items-center gap-1.5 rounded-full px-3 py-0.5'
                  >
                    <strong className='max-w-[140px] truncate'>
                      {svc.serviceName}
                    </strong>
                    <span className='text-muted-foreground'>
                      {t('serviceQueue', { count: svc.queueLength })}
                      {svc.estimatedWaitMinutes > 0 &&
                        ` · ~${Math.round(svc.estimatedWaitMinutes)} ${t('minutes')}`}
                    </span>
                  </span>
                ))
              ) : (
                // Aggregate view (single service or no breakdown)
                <>
                  <span>
                    {t('queueLength')}:{' '}
                    <strong>{queueStatus.queueLength}</strong>
                  </span>
                  {queueStatus.estimatedWaitMinutes > 0 && (
                    <span>
                      {t('estimatedWait')}:{' '}
                      <strong>
                        ~{Math.round(queueStatus.estimatedWaitMinutes)}{' '}
                        {t('minutes')}
                      </strong>
                    </span>
                  )}
                  {queueStatus.activeCounters > 0 && (
                    <span>
                      {t('activeCounters')}:{' '}
                      <strong>{queueStatus.activeCounters}</strong>
                    </span>
                  )}
                </>
              )}
            </div>
          )}
          {/* Virtual queue QR */}
          {virtualQueueEnabled && (
            <div className='flex items-center gap-3'>
              <p className='text-muted-foreground max-w-[120px] text-right text-xs leading-tight'>
                {t('scanToJoinQueue')}
              </p>
              <div className='rounded bg-white p-1'>
                <QRCode value={queueUrl} size={64} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom: Ticker */}
      <div className='z-20 flex-none'>
        <QueueTicker tickets={waitingTickets} />
      </div>
    </div>
  );
}
