'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  formatAppDate,
  formatAppTime,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { Ticket, ticketsApi, unitsApi, Material, UnitConfig } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useUnit } from '@/lib/hooks';
import { socketClient } from '@/lib/socket';
import { AdPlayer } from '@/components/screen/ad-player';
import { CalledTicketsTable } from '@/components/screen/called-tickets-table';
import { QueueTicker } from '@/components/screen/queue-ticker';
import { CallNotification } from '@/components/screen/call-notification';
import { Spinner } from '@/components/ui/spinner';

interface ScreenUnitClientProps {
  unitId: string;
}

export function ScreenUnitClient({ unitId }: ScreenUnitClientProps) {
  const t = useTranslations('screen');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [materials, setMaterials] = useState<Material[]>([]);

  // State for call notification
  const [showingNotification, setShowingNotification] = useState<Ticket | null>(
    null
  );

  // Use useUnit hook with polling
  const { data: unit, isLoading: isUnitLoading } = useUnit(unitId, {
    refetchInterval: 120000
  });

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket + tickets: WS room is always the subdivision (ticket.UnitID); screen URL may be a service_zone.
  useEffect(() => {
    if (!unitId || !unit) return;

    let cancelled = false;
    const wsRoomId =
      unit.kind === 'service_zone' && unit.parentId ? unit.parentId : unitId;

    const fetchTickets = async () => {
      try {
        const data = await ticketsApi.getByUnitId(unitId);
        if (!cancelled) {
          setTickets(data);
          setIsLoading(false);
        }
      } catch (error) {
        logger.error('Failed to fetch tickets:', error);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void fetchTickets();

    socketClient.connect(wsRoomId);

    const handleTicketUpdate = () => {
      void fetchTickets();
    };

    const handleEOD = () => {
      logger.log('EOD event received, refreshing tickets');
      void fetchTickets();
    };

    socketClient.onTicketCreated(handleTicketUpdate);
    socketClient.onTicketUpdated(handleTicketUpdate);
    socketClient.onTicketCalled(handleTicketUpdate);
    socketClient.onUnitEOD(handleEOD);

    return () => {
      cancelled = true;
      socketClient.off('ticket.created', handleTicketUpdate);
      socketClient.off('ticket.updated', handleTicketUpdate);
      socketClient.off('ticket.called', handleTicketUpdate);
      socketClient.off('unit.eod', handleEOD);
      socketClient.disconnect();
    };
  }, [unitId, unit]);

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

  // Callback for notification completion
  const handleNotificationComplete = useCallback(() => {
    setShowingNotification(null);
  }, []);

  if (isLoading) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        <Spinner className='h-12 w-12' />
      </div>
    );
  }

  if (isUnitLoading || !unit) {
    return (
      <div className='bg-background text-foreground flex min-h-screen items-center justify-center'>
        {isUnitLoading ? (
          <Spinner className='h-12 w-12' />
        ) : (
          <h1 className='text-2xl'>{t('unitNotFound')}</h1>
        )}
      </div>
    );
  }

  const calledTicketsRaw = tickets
    .filter(
      (t) =>
        t.status === 'called' ||
        t.status === 'in_service' ||
        t.status === 'served'
    )
    .sort(
      (a, b) =>
        new Date(b.calledAt || 0).getTime() -
        new Date(a.calledAt || 0).getTime()
    );

  // Filter to keep only the latest ticket per counter
  const uniqueCounterTickets = new Map<string, string>(); // counterId -> ticketId
  const calledTickets = calledTicketsRaw.filter((t) => {
    if (!t.counter?.id) return false;
    if (uniqueCounterTickets.has(t.counter.id)) return false;
    uniqueCounterTickets.set(t.counter.id, t.id);
    return true;
  });

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
          <h1 className='text-primary text-4xl font-bold'>{unit.name}</h1>
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
          />
        </div>
      </div>

      {/* Bottom: Ticker */}
      <div className='z-20 flex-none'>
        <QueueTicker tickets={waitingTickets} />
      </div>

      {/* Notification Overlay */}
      <CallNotification
        ticket={showingNotification}
        onComplete={handleNotificationComplete}
      />
    </div>
  );
}
