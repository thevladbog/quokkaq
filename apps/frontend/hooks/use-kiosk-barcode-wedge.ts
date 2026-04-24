'use client';

import { useEffect, useRef } from 'react';

const WEDGE_MAX_MS = 100;
const DEFAULT_MAX = 64;
const LONG_MAX = 4_096;
const MRZ_LINE_STALE_MS = 2_000;

export type KioskWedgeLineMode = 'code' | 'longText' | 'mrz';

type WedgeOptions = {
  mode?: KioskWedgeLineMode;
  maxLenPerSegment?: number;
};

function isCodeChar(ch: string): boolean {
  return /^[0-9A-Za-z\-._:/#?&=%+]$/.test(ch);
}

function isLongTextChar(ch: string): boolean {
  return isCodeChar(ch) || ch === '<' || ch === '|' || ch === ' ';
}

function isMrzChar(ch: string): boolean {
  return ch === ' ' || /^[0-9A-Za-z<]$/i.test(ch);
}

/**
 * Buffers keypresses; on Enter (or short idle) emits a line. MRZ: multi-line buffer + run-on 88/90.
 */
export function useKioskBarcodeWedge(
  active: boolean,
  onLine: (s: string) => void,
  options: WedgeOptions = {}
) {
  const mode = options.mode ?? 'code';
  const maxSeg =
    options.maxLenPerSegment ?? (mode === 'code' ? DEFAULT_MAX : LONG_MAX);

  const buf = useRef('');
  const firstAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mrzLineBuf = useRef<string[]>([]);
  const lastMrzLineAt = useRef(0);
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  const emit = (s: string) => {
    const t = s.trim();
    if (t) {
      onLineRef.current(t);
    }
  };

  useEffect(() => {
    if (!active) {
      buf.current = '';
      mrzLineBuf.current = [];
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
    const flush = (raw: string) => {
      emit(raw);
      buf.current = '';
      firstAt.current = 0;
    };

    const pushMrzLine = (line: string) => {
      const now = Date.now();
      if (now - lastMrzLineAt.current > MRZ_LINE_STALE_MS) {
        mrzLineBuf.current = [];
      }
      lastMrzLineAt.current = now;
      const norm = line.toUpperCase().replace(/[^0-9A-Z<]+/g, '');
      if (!norm) {
        return;
      }
      mrzLineBuf.current.push(norm);
      if (mrzLineBuf.current.length > 3) {
        mrzLineBuf.current = mrzLineBuf.current.slice(-3);
      }
      if (mrzLineBuf.current.length === 2) {
        const [a, b] = mrzLineBuf.current;
        if (a!.length >= 20 && b!.length >= 20) {
          emit([a, b].join('\n'));
          mrzLineBuf.current = [];
        }
      } else if (mrzLineBuf.current.length === 3) {
        const [a, b, c] = mrzLineBuf.current;
        if (a!.length >= 15) {
          emit([a, b, c].join('\n'));
          mrzLineBuf.current = [];
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (mode === 'mrz') {
          const cur = buf.current.toUpperCase().replace(/[^0-9A-Z<]+/g, '');
          if (cur.length === 88 || cur.length === 90) {
            emit(cur);
            buf.current = '';
            mrzLineBuf.current = [];
            if (timer.current) {
              clearTimeout(timer.current);
              timer.current = null;
            }
            return;
          }
          if (cur) {
            pushMrzLine(cur);
          }
          buf.current = '';
        } else {
          flush(buf.current);
        }
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        return;
      }
      if (e.key.length !== 1) {
        return;
      }
      const ch = e.key;
      const ok =
        mode === 'code'
          ? isCodeChar(ch)
          : mode === 'longText'
            ? isLongTextChar(ch)
            : isMrzChar(ch);
      if (!ok) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (!firstAt.current || now - firstAt.current > WEDGE_MAX_MS) {
        buf.current = '';
        firstAt.current = now;
      }
      if (buf.current.length < maxSeg) {
        if (mode === 'mrz') {
          buf.current += ch === ' ' ? ' ' : ch.toUpperCase();
        } else {
          buf.current += ch;
        }
      }
      if (mode === 'mrz') {
        return;
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
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active, maxSeg, mode]);
}
