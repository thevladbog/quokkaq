'use client';

import { useEffect, useRef } from 'react';
import { isTauriKiosk } from '@/lib/kiosk-print';
import { serialScannerStreamUrl } from '@/lib/kiosk-scanner-agent';

const LS_PATH = 'kioskSerialPath';
const LS_BAUD = 'kioskSerialBaud';

/**
 * Subscribes to the local agent's serial stream (see apps/kiosk-desktop/agent) when
 * a port is saved in localStorage (KioskSettings). Feeds the same string line as the HID wedge.
 */
export function useKioskSerialScannerStream(
  active: boolean,
  onLine: (s: string) => void
) {
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !isTauriKiosk()) {
      return undefined;
    }
    const path = (localStorage.getItem(LS_PATH) || '').trim();
    if (!path) {
      return undefined;
    }
    const baud = Number(localStorage.getItem(LS_BAUD) || '9600') || 9600;
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
  }, [active]);
}
