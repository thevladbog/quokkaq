'use client';

import { useEffect, useRef } from 'react';
import { postUnitsUnitIdKioskTelemetry } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { logger } from '@/lib/logger';

const PING_INTERVAL_MS = 3 * 60_000;

/**
 * While the kiosk is active, measure API round-trip to the current unit and post `api_ping` + `roundtripMs`.
 * Also sends a lightweight sample on `online` / `offline` (for ops dashboards, not for PII).
 */
export function useKioskTelemetryPing(
  unitId: string | undefined,
  enabled: boolean
) {
  const idRef = useRef(unitId);
  useEffect(() => {
    idRef.current = unitId;
  }, [unitId]);

  const runPing = () => {
    const id = idRef.current;
    if (!id) {
      return;
    }
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    void (async () => {
      try {
        await unitsApi.getById(id);
        const t1 =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        const roundtripMs = Math.max(0, Math.round(t1 - t0));
        await postUnitsUnitIdKioskTelemetry(id, {
          kind: 'api_ping',
          meta: { roundtripMs } as Record<string, unknown>
        });
      } catch (e) {
        logger.warn('kiosk api_ping telemetry failed', { unitId: id, e });
      }
    })();
  };

  useEffect(() => {
    if (!enabled || !unitId) {
      return undefined;
    }
    const onOnline = () => {
      void (async () => {
        try {
          await postUnitsUnitIdKioskTelemetry(unitId, {
            kind: 'heartbeat',
            meta: { online: true } as Record<string, unknown>
          });
        } catch (e) {
          logger.warn('kiosk online heartbeat failed', { unitId, e });
        }
        runPing();
      })();
    };
    const onOffline = () => {
      void (async () => {
        try {
          await postUnitsUnitIdKioskTelemetry(unitId, {
            kind: 'heartbeat',
            meta: { online: false } as Record<string, unknown>
          });
        } catch {
          // ignore when offline
        }
      })();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    runPing();
    const t = window.setInterval(runPing, PING_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(t);
    };
  }, [enabled, unitId]);
}
