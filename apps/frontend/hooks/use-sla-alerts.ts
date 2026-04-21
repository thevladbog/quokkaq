'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { socketClient, type SlaAlertPayload } from '@/lib/socket';
import { logger } from '@/lib/logger';
import { formatSlaDuration } from '@/lib/format-sla-duration';

export type { SlaAlertPayload };

function playSlaBreachSound() {
  if (typeof window === 'undefined') return;
  try {
    const audio = new Audio('/sounds/sla-alert.mp3');
    audio.volume = 0.6;
    void audio.play();
  } catch {
    // Autoplay policy may block; silently ignore.
  }
}

function sendBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, icon: '/favicon.ico' });
  } catch (e) {
    logger.error('SLA browser notification error:', e);
  }
}

export function useSlaAlerts(unitId: string | null | undefined) {
  const queryClient = useQueryClient();
  const t = useTranslations('supervisor.dashboardUi.sla');
  const [activeSlaAlerts, setActiveSlaAlerts] = useState<SlaAlertPayload[]>([]);

  // Track which (alertType, ticketId, thresholdPct) triples have been toasted.
  const seenRef = useRef<Set<string>>(new Set());

  // Request browser notification permission once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        /* ignore */
      });
    }
  }, []);

  const handleAlert = useCallback(
    (payload: SlaAlertPayload, isBreach: boolean) => {
      const alertType = payload.alertType ?? 'wait';
      const key = `${alertType}:${payload.ticketId}:${payload.thresholdPct}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      const elapsed = formatSlaDuration(payload.elapsedSec);
      const maxWait = formatSlaDuration(payload.maxWaitTimeSec);

      const isServiceAlert = alertType === 'service';

      const titleKey = isBreach
        ? isServiceAlert
          ? 'serviceBreachTitle'
          : 'breachTitle'
        : isServiceAlert
          ? 'serviceWarningTitle'
          : 'warningTitle';

      const bodyKey = isBreach
        ? isServiceAlert
          ? 'serviceBreachBody'
          : 'breachBody'
        : isServiceAlert
          ? 'serviceWarningBody'
          : 'warningBody';

      const title = t(titleKey, { queueNumber: payload.queueNumber });
      const body = t(bodyKey, {
        serviceName: payload.serviceName,
        elapsed,
        maxWait
      });

      if (isBreach) {
        toast.error(title, {
          description: body,
          duration: Infinity,
          id: `sla-breach-${alertType}-${payload.ticketId}`
        });
        playSlaBreachSound();
      } else {
        toast.warning(title, {
          description: body,
          duration: 10000,
          id: `sla-warn-${alertType}-${payload.ticketId}-${payload.thresholdPct}`
        });
      }

      sendBrowserNotification(
        t('browserNotificationTitle'),
        `${title}\n${body}`,
        key
      );

      setActiveSlaAlerts((prev) => {
        // For the same ticket, track wait and service alerts independently.
        const existing = prev.findIndex(
          (a) =>
            a.ticketId === payload.ticketId &&
            (a.alertType ?? 'wait') === alertType
        );
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = payload;
          return next;
        }
        return [...prev, payload];
      });

      // Refresh the supervisor queue so updated ticket times are visible.
      void queryClient.invalidateQueries({ queryKey: ['shift-queue', unitId] });
    },
    [t, queryClient, unitId]
  );

  const dismissAlert = useCallback(
    (ticketId: string, alertType?: 'wait' | 'service') => {
      setActiveSlaAlerts((prev) =>
        prev.filter(
          (a) =>
            a.ticketId !== ticketId ||
            (alertType !== undefined && (a.alertType ?? 'wait') !== alertType)
        )
      );
    },
    []
  );

  const dismissAllAlerts = useCallback(() => {
    setActiveSlaAlerts([]);
    seenRef.current.clear();
  }, []);

  useEffect(() => {
    // Mutating a ref is always safe in an effect. Clear dedupe markers so a
    // fresh subscription for the new unit starts with no suppressed keys.
    seenRef.current.clear();

    if (!unitId) return;

    const handleWarning = (data: unknown) =>
      handleAlert(data as SlaAlertPayload, false);
    const handleBreach = (data: unknown) =>
      handleAlert(data as SlaAlertPayload, true);
    const handleServiceWarning = (data: unknown) =>
      handleAlert(data as SlaAlertPayload, false);
    const handleServiceBreach = (data: unknown) =>
      handleAlert(data as SlaAlertPayload, true);

    socketClient.on('unit.sla_warning', handleWarning);
    socketClient.on('unit.sla_breach', handleBreach);
    socketClient.on('unit.service_sla_warning', handleServiceWarning);
    socketClient.on('unit.service_sla_breach', handleServiceBreach);

    return () => {
      socketClient.off('unit.sla_warning', handleWarning);
      socketClient.off('unit.sla_breach', handleBreach);
      socketClient.off('unit.service_sla_warning', handleServiceWarning);
      socketClient.off('unit.service_sla_breach', handleServiceBreach);
    };
  }, [unitId, handleAlert]);

  // Derive alerts scoped to the current unit rather than imperatively resetting
  // state when unitId changes (avoids setState-in-effect cascading renders).
  const unitSlaAlerts = useMemo(
    () => (unitId ? activeSlaAlerts.filter((a) => a.unitId === unitId) : []),
    [activeSlaAlerts, unitId]
  );

  return { activeSlaAlerts: unitSlaAlerts, dismissAlert, dismissAllAlerts };
}
