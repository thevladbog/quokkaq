'use client';

import { useEffect, useRef } from 'react';

const WEDGE_MAX_MS = 100;
const WEDGE_MAX_LEN = 64;

/**
 * Buffers keypresses; if Enter arrives quickly after digits/alnum, treats as a scanner line.
 * Only use while `active` and the check-in surface is focused (e.g. open modal).
 */
export function useKioskBarcodeWedge(
  active: boolean,
  onLine: (s: string) => void
) {
  const buf = useRef('');
  const firstAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      buf.current = '';
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const flush = (emit: string) => {
      const t = emit.trim();
      if (t) {
        onLine(t);
      }
      buf.current = '';
      firstAt.current = 0;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        flush(buf.current);
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        return;
      }
      if (e.key.length === 1) {
        const ch = e.key;
        if (/^[0-9A-Za-z\-._:/#?&=%+]$/.test(ch)) {
          e.preventDefault();
          e.stopPropagation();
          const now = Date.now();
          if (!firstAt.current || now - firstAt.current > WEDGE_MAX_MS) {
            buf.current = '';
            firstAt.current = now;
          }
          if (buf.current.length < WEDGE_MAX_LEN) {
            buf.current += ch;
          }
          if (timer.current) {
            clearTimeout(timer.current);
          }
          timer.current = setTimeout(() => {
            timer.current = null;
            if (buf.current) {
              flush(buf.current);
            }
          }, WEDGE_MAX_MS);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active, onLine]);
}
