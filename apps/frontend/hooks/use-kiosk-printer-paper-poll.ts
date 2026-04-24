'use client';

import { useEffect, useRef } from 'react';

import { isTauriKiosk, listPrintersViaTauri } from '@quokkaq/kiosk-lib';
import { reportKioskPrinterTelemetry } from '@/lib/kiosk-printer-telemetry';

type KioskPrintSlice = {
  isPrintEnabled?: boolean;
  printerType?: string;
  printerConnection?: 'network' | 'system';
  systemPrinterName?: string;
};

const DEFAULT_INTERVAL_MS = 45_000;

/**
 * Polls the local print agent (Tauri) for the configured system printer; when `paperOut`
 * becomes true, reports once per incident until the condition clears.
 */
export function useKioskPrinterPaperOutPoll(config: {
  unitId: string | undefined;
  enabled: boolean;
  kiosk: KioskPrintSlice | null | undefined;
  intervalMs?: number;
}): void {
  const { unitId, enabled, kiosk, intervalMs = DEFAULT_INTERVAL_MS } = config;
  const lastState = useRef<'ok' | 'paper' | null>(null);

  useEffect(() => {
    if (!enabled || !unitId || !kiosk) {
      return undefined;
    }
    if (!isTauriKiosk()) {
      return undefined;
    }
    if (kiosk.isPrintEnabled === false || kiosk.printerType === 'label') {
      return undefined;
    }
    const connection =
      kiosk.printerConnection ??
      (kiosk.systemPrinterName?.trim() ? ('system' as const) : 'network');
    if (connection !== 'system') {
      return undefined;
    }
    const name = kiosk.systemPrinterName?.trim();
    if (!name) {
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      const { printers, error } = await listPrintersViaTauri();
      if (error || !printers.length) {
        return;
      }
      const p = printers.find((x) => x.name === name);
      if (!p) {
        return;
      }
      if (p.paperOut === true) {
        if (lastState.current !== 'paper') {
          lastState.current = 'paper';
          reportKioskPrinterTelemetry(
            unitId,
            'paper_out',
            p.status?.trim() || 'Printer reports out of paper'
          );
        }
        return;
      }
      lastState.current = 'ok';
    };

    const id = window.setInterval(() => {
      void tick();
    }, intervalMs);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, unitId, intervalMs, kiosk]);
}
