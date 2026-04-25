'use client';

import { useEffect, useRef, useState } from 'react';
import { isTauriKiosk } from '@/lib/kiosk-print';
import { serialScannerStreamUrl } from '@/lib/kiosk-scanner-agent';
import {
  ensureKioskTauriLocalMigrated,
  KIOSK_TAURI_DEVICE_CHANGED_EVENT,
  readKioskTauriLocalDevice
} from '@/lib/kiosk-tauri-device-config';

/**
 * Subscribes to the local agent's serial stream (see apps/kiosk-desktop/agent) when
 * a port is saved in Tauri per-unit device config. Feeds the same string line as the HID wedge.
 */
export function useKioskSerialScannerStream(
  active: boolean,
  onLine: (s: string) => void,
  unitId: string
) {
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  const [deviceCfgEpoch, setDeviceCfgEpoch] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const bump = () => setDeviceCfgEpoch((n) => n + 1);
    window.addEventListener(KIOSK_TAURI_DEVICE_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener(KIOSK_TAURI_DEVICE_CHANGED_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !isTauriKiosk()) {
      return undefined;
    }
    const id = (unitId || '').trim();
    if (!id) {
      return undefined;
    }
    ensureKioskTauriLocalMigrated(id, undefined);
    const d = readKioskTauriLocalDevice(id);
    const path = (d?.serialPath || '').trim();
    if (!path) {
      return undefined;
    }
    const baud = d?.serialBaud && d.serialBaud > 0 ? d.serialBaud : 9600;
    const url = serialScannerStreamUrl(path, baud);
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      let line = ev.data;
      try {
        line = JSON.parse(ev.data) as string;
      } catch {
        // legacy agent sent raw data
      }
      if (line) {
        onLineRef.current(String(line));
      }
    };
    es.onerror = () => {
      // Let the user retry by closing/reopening the modal; avoid tight reconnect loops.
      es.close();
    };
    return () => {
      es.close();
    };
  }, [active, unitId, deviceCfgEpoch]);
}
