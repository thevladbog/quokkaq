'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentSlide } from '@/components/screen/content-player';
import { getGetUnitsUnitIdTicketsQueryKey } from '@/lib/api/generated/tickets-counters';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { Material, UnitConfig, unitsApi, type Ticket } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTickets, useUnit } from '@/lib/hooks';
import { socketClient, type UnitETASnapshot } from '@/lib/socket';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';

const EMPTY_TICKET_LIST: Ticket[] = [];

/** Overlay per-ticket queue positions from `unit.eta_update` (not on REST list before merge). */
export function mergeTicketsQueuePositionFromEta(
  waiting: Ticket[],
  rows: UnitETASnapshot['tickets']
): Ticket[] {
  if (!rows?.length) {
    return waiting;
  }
  const m = new Map(rows.map((r) => [r.ticketId, r.queuePosition]));
  return waiting.map((t) => {
    const qp = m.get(t.id);
    if (qp == null) {
      return t;
    }
    return { ...t, queuePosition: qp };
  });
}

export function deriveCalledTicketsForScreen(tickets: Ticket[]): Ticket[] {
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

export type QueueStatusState = {
  queueLength: number;
  estimatedWaitMinutes: number;
  maxWaitingInQueueMinutes?: number;
  activeCounters: number;
  servedToday?: number;
  services?: Array<{
    serviceId: string;
    serviceName: string;
    queueLength: number;
    estimatedWaitMinutes: number;
  }>;
};

export type AnnItem = {
  id: string;
  text: string;
  style: string;
  priority: number;
};

/**
 * Live tickets, queue, signage feeds, and clock — shared by `/screen/[unitId]` and
 * admin draft preview (template passed separately).
 */
export function useScreenRendererLiveData(unitId: string) {
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

  const { data: unit, isLoading: isUnitLoading } = useUnit(unitId, {
    refetchInterval: 120000
  });

  const { data: activePlData } = useQuery({
    queryKey: ['signage', 'active-playlist', unitId],
    queryFn: () => unitsApi.getActivePlaylist(unitId),
    enabled: Boolean(unitId),
    refetchInterval: 60_000
  });

  const { data: publicAnnouncements = [] } = useQuery({
    queryKey: ['signage', 'public-ann', unitId],
    queryFn: () => unitsApi.getPublicScreenAnnouncements(unitId),
    enabled: Boolean(unitId),
    refetchInterval: 120_000
  });

  const contentSlides: ContentSlide[] = useMemo(() => {
    const pl = activePlData as
      | {
          source?: string;
          playlist?: {
            items?: Array<{
              id: string;
              duration?: number;
              material?: { type?: string; url?: string };
            }>;
          };
        }
      | undefined;
    if (pl?.source && pl.source !== 'none' && pl.playlist?.items?.length) {
      return pl.playlist.items
        .filter((it) => it.material?.url)
        .map((it) => ({
          id: it.id,
          type: it.material?.type || 'image',
          url: it.material!.url!,
          durationSec: it.duration ?? 0
        }));
    }
    return materials.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      durationSec: 0
    }));
  }, [activePlData, materials]);

  const [queueStatus, setQueueStatus] = useState<QueueStatusState | null>(null);

  const [etaTicketRows, setEtaTicketRows] =
    useState<UnitETASnapshot['tickets']>(undefined);

  useEffect(() => {
    if (!unitId) return;
    const fetch = () => {
      unitsApi
        .getQueueStatus(unitId)
        .then(setQueueStatus)
        .catch(() => null);
    };
    fetch();
    const iv = setInterval(fetch, 60_000);
    return () => clearInterval(iv);
  }, [unitId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const unitKind = unit?.kind;
  const unitParentId = unit?.parentId;

  useEffect(() => {
    if (!unitId || unitKind == null) return;

    const wsRoomId =
      unitKind === 'service_zone' && unitParentId ? unitParentId : unitId;

    const ticketsQueryKey = getGetUnitsUnitIdTicketsQueryKey(unitId);
    const wsDebounceRef = { t: null as ReturnType<typeof setTimeout> | null };
    const signageDebounceRef = {
      t: null as ReturnType<typeof setTimeout> | null
    };

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
      scheduleWsRefetch();
    };

    const handleEta = (snap: UnitETASnapshot) => {
      setQueueStatus({
        queueLength: snap.queueLength,
        estimatedWaitMinutes: snap.estimatedWaitMinutes,
        maxWaitingInQueueMinutes: snap.maxWaitingInQueueMinutes,
        activeCounters: snap.activeCounters,
        servedToday: snap.servedToday,
        services: snap.services
      });
      setEtaTicketRows(snap.tickets);
    };

    const handleSignage = () => {
      if (signageDebounceRef.t) {
        clearTimeout(signageDebounceRef.t);
      }
      signageDebounceRef.t = setTimeout(() => {
        signageDebounceRef.t = null;
        void queryClient.invalidateQueries({
          queryKey: ['signage', 'active-playlist', unitId]
        });
        void queryClient.invalidateQueries({
          queryKey: ['signage', 'public-ann', unitId]
        });
        void queryClient.invalidateQueries({
          queryKey: getGetUnitByIDQueryKey(unitId)
        });
        scheduleWsRefetch();
      }, 300);
    };

    socketClient.onTicketCreated(handleTicketUpdate);
    socketClient.onTicketUpdated(handleTicketUpdate);
    socketClient.onTicketCalled(handleTicketUpdate);
    socketClient.onUnitEOD(handleEOD);
    socketClient.onEtaUpdate(handleEta);
    socketClient.on('screen.content_updated', handleSignage);
    socketClient.on('feed.updated', handleSignage);
    socketClient.on('screen.announcement', handleSignage);

    return () => {
      if (wsDebounceRef.t) {
        clearTimeout(wsDebounceRef.t);
        wsDebounceRef.t = null;
      }
      if (signageDebounceRef.t) {
        clearTimeout(signageDebounceRef.t);
        signageDebounceRef.t = null;
      }
      socketClient.off('ticket.created', handleTicketUpdate);
      socketClient.off('ticket.updated', handleTicketUpdate);
      socketClient.off('ticket.called', handleTicketUpdate);
      socketClient.off('unit.eod', handleEOD);
      socketClient.offEtaUpdate(handleEta);
      socketClient.off('screen.content_updated', handleSignage);
      socketClient.off('feed.updated', handleSignage);
      socketClient.off('screen.announcement', handleSignage);
      socketClient.disconnect();
    };
  }, [unitId, unitKind, unitParentId, queryClient]);

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
      void fetchMaterials();
    }

    const interval = setInterval(() => {
      void fetchMaterials();
    }, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [unitId, unit]);

  const tickets = ticketsData ?? EMPTY_TICKET_LIST;

  const calledTickets = useMemo(
    () => deriveCalledTicketsForScreen(tickets),
    [tickets]
  );

  const waitingTicketsForScreen = useMemo(() => {
    const waitingTickets = tickets
      .filter((t) => t.status === 'waiting')
      .sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
      );
    return mergeTicketsQueuePositionFromEta(waitingTickets, etaTicketRows);
  }, [tickets, etaTicketRows]);

  const config = unit?.config as UnitConfig | undefined;
  const adConfig = config?.adScreen;

  const virtualQueueEnabled = useMemo(
    () =>
      (config as { virtualQueue?: { enabled?: boolean } } | null)?.virtualQueue
        ?.enabled === true,
    [config]
  );

  const queueUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? `${window.location.origin}/${locale}/queue/${unitId}`
        : `/${locale}/queue/${unitId}`,
    [locale, unitId]
  );

  const annForRenderer: AnnItem[] = useMemo(
    () =>
      publicAnnouncements
        .filter(
          (a) =>
            ((a as { displayMode?: string }).displayMode || 'banner') ===
            'banner'
        )
        .map((a) => ({
          id: a.id ?? '',
          text: a.text ?? '',
          style: a.style ?? 'info',
          priority: a.priority ?? 0
        })),
    [publicAnnouncements]
  );

  const annFullscreen: AnnItem[] = useMemo(
    () =>
      publicAnnouncements
        .filter(
          (a) => (a as { displayMode?: string }).displayMode === 'fullscreen'
        )
        .map((a) => ({
          id: a.id ?? '',
          text: a.text ?? '',
          style: a.style ?? 'info',
          priority: a.priority ?? 0
        })),
    [publicAnnouncements]
  );

  return {
    locale,
    intlLocale,
    queryClient,
    unit,
    isUnitLoading,
    ticketsData,
    ticketsLoading,
    ticketsPending,
    ticketsError,
    currentTime,
    contentSlides,
    queueStatus,
    calledTickets,
    waitingTicketsForScreen,
    annForRenderer,
    annFullscreen,
    virtualQueueEnabled,
    queueUrl,
    config,
    adConfig
  };
}
