'use client';

import { useCallback, useEffect, useState } from 'react';
import { socketClient, type KioskPrinterAlertPayload } from '@/lib/socket';

function alertKey(p: KioskPrinterAlertPayload): string {
  return `${p.at}::${p.kind}::${p.message}`;
}

/**
 * Kiosk-reported printer issues (WebSocket `unit.kiosk_printer`) for the supervisor unit dashboard.
 */
export function useKioskPrinterAlerts(unitId: string | null | undefined) {
  const [alerts, setAlerts] = useState<KioskPrinterAlertPayload[]>([]);

  useEffect(() => {
    if (!unitId) {
      return;
    }
    socketClient.connect(unitId);
    const h = (p: KioskPrinterAlertPayload) => {
      if (p.unitId !== unitId) {
        return;
      }
      setAlerts((prev) => {
        const k = alertKey(p);
        if (prev.some((x) => alertKey(x) === k)) {
          return prev;
        }
        return [p, ...prev].slice(0, 20);
      });
    };
    socketClient.onKioskPrinterAlert(h);
    return () => {
      socketClient.offKioskPrinterAlert(h);
    };
  }, [unitId]);

  const dismiss = useCallback((p: KioskPrinterAlertPayload) => {
    const k = alertKey(p);
    setAlerts((prev) => prev.filter((x) => alertKey(x) !== k));
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts([]);
  }, []);

  return { alerts, dismiss, dismissAll };
}
