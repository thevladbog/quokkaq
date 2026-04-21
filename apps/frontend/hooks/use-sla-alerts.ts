'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { socketClient, type SlaAlertPayload } from '@/lib/socket';
import { logger } from '@/lib/logger';

export type { SlaAlertPayload };

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m}m ${s}s`;
}

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

  // Track which (ticketId, thresholdPct) pairs have already been toasted to
  // prevent duplicate toasts when the component remounts.
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
      const key = `${payload.ticketId}:${payload.thresholdPct}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      const elapsed = formatMinutes(payload.elapsedSec);
      const maxWait = formatMinutes(payload.maxWaitTimeSec);

      const titleKey = isBreach ? 'breachTitle' : 'warningTitle';
      const bodyKey = isBreach ? 'breachBody' : 'warningBody';
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
          id: `sla-breach-${payload.ticketId}`
        });
        playSlaBreachSound();
      } else {
        const toastFn =
          payload.thresholdPct >= 80 ? toast.warning : toast.warning;
        toastFn(title, {
          description: body,
          duration: 10000,
          id: `sla-warn-${payload.ticketId}-${payload.thresholdPct}`
        });
      }

      sendBrowserNotification(
        t('browserNotificationTitle'),
        `${title}\n${body}`,
        key
      );

      setActiveSlaAlerts((prev) => {
        const existing = prev.findIndex((a) => a.ticketId === payload.ticketId);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = payload;
          return next;
        }
        return [...prev, payload];
      });

      // Refresh the supervisor queue so the updated ticket wait times are visible.
      void queryClient.invalidateQueries({ queryKey: ['shift-queue', unitId] });
    },
    [t, queryClient, unitId]
  );

  const dismissAlert = useCallback((ticketId: string) => {
    setActiveSlaAlerts((prev) => prev.filter((a) => a.ticketId !== ticketId));
  }, []);

  const dismissAllAlerts = useCallback(() => {
    setActiveSlaAlerts([]);
  }, []);

  useEffect(() => {
    if (!unitId) return;

    const handleWarning = (data: unknown) =>
      handleAlert(data as SlaAlertPayload, false);
    const handleBreach = (data: unknown) =>
      handleAlert(data as SlaAlertPayload, true);

    socketClient.on('unit.sla_warning', handleWarning);
    socketClient.on('unit.sla_breach', handleBreach);

    return () => {
      socketClient.off('unit.sla_warning', handleWarning);
      socketClient.off('unit.sla_breach', handleBreach);
    };
  }, [unitId, handleAlert]);

  return { activeSlaAlerts, dismissAlert, dismissAllAlerts };
}
