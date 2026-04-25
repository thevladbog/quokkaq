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

type DocumentOcrWedgeOptions = {
  /** MRZ: ICAO lines, 88/90 run-on, 2/3 line assembly. */
  enableMrz: boolean;
  /** RU driving license: pipe / longText-style segments. */
  enableRu: boolean;
};

/**
 * One keyboard-wedge stream for the kiosk document OCR dialog. Avoids two
 * `useKioskBarcodeWedge` listeners; MRZ assembly runs first, then a raw RU
 * line is emitted when still unmatched.
 */
export function useKioskDocumentOcrWedge(
  active: boolean,
  onLine: (s: string) => void,
  { enableMrz, enableRu }: DocumentOcrWedgeOptions
) {
  const buf = useRef('');
  const firstAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mrzLineBuf = useRef<string[]>([]);
  const lastMrzLineAt = useRef(0);
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (!active) {
      buf.current = '';
      mrzLineBuf.current = [];
      firstAt.current = 0;
      clearTimer();
    }
  }, [active]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    if (!enableMrz && !enableRu) {
      return undefined;
    }

    const emit = (s: string) => {
      const t = s.trim();
      if (t) {
        onLineRef.current(t);
      }
    };

    const pushMrzLine = (line: string) => {
      const now = Date.now();
      if (now - lastMrzLineAt.current > MRZ_LINE_STALE_MS) {
        mrzLineBuf.current = [];
      }
      lastMrzLineAt.current = now;
      const norm = line.toUpperCase().replace(/[^0-9A-Z<]+/g, '');
      if (!norm) {
        return false;
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
          return true;
        }
      } else if (mrzLineBuf.current.length === 3) {
        const [a, b, c] = mrzLineBuf.current;
        if (a!.length >= 15) {
          emit([a, b, c].join('\n'));
          mrzLineBuf.current = [];
          return true;
        }
      }
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const raw = buf.current;
        const cur = raw.toUpperCase().replace(/[^0-9A-Z<]+/g, '');

        let emitted = false;
        if (enableMrz) {
          if (cur.length === 88 || cur.length === 90) {
            emit(cur);
            emitted = true;
          } else if (cur) {
            emitted = pushMrzLine(cur);
          }
        } else if (enableRu && raw) {
          emit(raw);
          emitted = true;
        }
        buf.current = '';
        firstAt.current = 0;
        clearTimer();
        if (emitted) {
          return;
        }
        if (enableMrz && !enableRu) {
          return;
        }
        // RU: Enter — prefer idle flush for unmarked long lines; avoid treating a
        // first MRZ line (no |) as RU when both parsers are on.
        if (enableRu && raw.trim() && (!enableMrz || raw.includes('|'))) {
          emit(raw);
        }
        return;
      }

      if (e.key.length !== 1) {
        return;
      }
      const ch = e.key;
      const charOk = enableMrz
        ? enableRu
          ? isLongTextChar(ch)
          : isMrzChar(ch)
        : isLongTextChar(ch);
      if (!charOk) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (!firstAt.current || now - firstAt.current > WEDGE_MAX_MS) {
        buf.current = '';
        firstAt.current = now;
        mrzLineBuf.current = [];
      }
      if (buf.current.length < LONG_MAX) {
        if (enableMrz && !enableRu) {
          buf.current += ch === ' ' ? ' ' : ch.toUpperCase();
        } else {
          buf.current += ch;
        }
      }
      if (enableMrz && !enableRu) {
        return;
      }
      if (!enableRu) {
        return;
      }
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        if (buf.current) {
          emit(buf.current);
          buf.current = '';
          firstAt.current = 0;
        }
      }, WEDGE_MAX_MS);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimer();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active, enableMrz, enableRu]);
}
