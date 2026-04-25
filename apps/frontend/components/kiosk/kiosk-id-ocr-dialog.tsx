'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Scan, ScanLine } from 'lucide-react';
import {
  formatIcaOmrzForKiosk,
  formatRuDrivingLicenseText,
  parseIcaOmrz,
  parseRuDrivingLicenseBarcode,
  runKioskOcrTauriFromBase64
} from '@quokkaq/kiosk-lib';
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { KioskDialogContent } from '@/components/kiosk/kiosk-dialog-content';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { isTauriKiosk } from '@/lib/kiosk-print';
import { useKioskDocumentOcrWedge } from '@/hooks/use-kiosk-barcode-wedge';
import { useKioskSerialScannerStream } from '@/hooks/use-kiosk-serial-scanner';
import {
  KIOSK_TAURI_DEVICE_CHANGED_EVENT,
  readKioskTauriLocalDevice
} from '@/lib/kiosk-tauri-device-config';

type KioskIdOcrDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Kiosk unit route id — serial scanner settings are per unit in Tauri. */
  unitId: string;
  /** When true and the shell is Tauri, call native tesseract. */
  preferNative: boolean;
  onUseText: (text: string) => void;
  /** Default true when unset: MRZ + RU via wedge/serial. */
  wedgeMrz?: boolean;
  wedgeRu?: boolean;
};

function canvasToJpegBase64(c: HTMLCanvasElement): string {
  const b64 = c.toDataURL('image/jpeg', 0.9);
  const i = b64.indexOf(',');
  if (i < 0) {
    return b64;
  }
  return b64.slice(i + 1);
}

const AUTO_APPLY_MIN_LEN = 32;
const AUTO_APPLY_MIN_CONF = 58;
const NATIVE_STABLE_MATCHES = 2;
const NATIVE_ONE_SHOT_MIN_LEN = 200;

function normalizeOcrStability(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function buildMrzText(raw: string): string {
  const t = raw.trim();
  const lines = t
    .split(/\n/)
    .map((l) => l.replace(/\r/g, '').trim())
    .filter(Boolean);
  const p =
    lines.length > 0
      ? lines.length === 1 &&
        (lines[0]!.length === 88 || lines[0]!.length === 90)
        ? parseIcaOmrz([lines[0]!])
        : parseIcaOmrz(lines)
      : { ok: false as const, error: 'empty' };
  if (p.ok) {
    return formatIcaOmrzForKiosk(p.value);
  }
  return '';
}

export function KioskIdOcrDialog({
  open,
  onOpenChange,
  unitId,
  preferNative,
  onUseText,
  wedgeMrz = true,
  wedgeRu = true
}: KioskIdOcrDialogProps) {
  const t = useTranslations('kiosk.id_ocr');
  const [deviceCfgEpoch, setDeviceCfgEpoch] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errKind, setErrKind] = useState<'error' | 'soft'>('error');
  const busyRef = useRef(false);
  const hasAutoClosedRef = useRef(false);
  const lastAutoNormRef = useRef<string>('');
  const nativeStreakRef = useRef(0);
  const wedgeActive = open && (wedgeMrz || wedgeRu);
  const hasSerialPath = (() => {
    void deviceCfgEpoch;
    return Boolean(readKioskTauriLocalDevice(unitId)?.serialPath?.trim());
  })();
  const showSerialCallout = isTauriKiosk() && hasSerialPath;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const bump = () => setDeviceCfgEpoch((n) => n + 1);
    window.addEventListener(KIOSK_TAURI_DEVICE_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener(KIOSK_TAURI_DEVICE_CHANGED_EVENT, bump);
    };
  }, [unitId]);

  const finishWithText = useCallback(
    (s: string) => {
      if (hasAutoClosedRef.current) {
        return;
      }
      hasAutoClosedRef.current = true;
      onUseText(s);
      onOpenChange(false);
    },
    [onOpenChange, onUseText]
  );

  const processScanLine = useCallback(
    (line: string) => {
      setErr(null);
      setErrKind('error');
      if (wedgeMrz) {
        const m = buildMrzText(line);
        if (m) {
          finishWithText(m);
          return;
        }
      }
      if (wedgeRu) {
        const p = parseRuDrivingLicenseBarcode(line);
        if (p.documentId && p.lastName) {
          finishWithText(formatRuDrivingLicenseText(p));
          return;
        }
        if (p.documentId || p.trailer) {
          finishWithText(
            formatRuDrivingLicenseText(p) ||
              t('ru_partial', { defaultValue: 'Partial data' })
          );
          return;
        }
        if (wedgeMrz) {
          setErr(
            t('document_scan_mrz_ru_mismatch', {
              defaultValue:
                'Not MRZ. For RU license, ensure the scan line includes the barcode separator (|), or use the camera.'
            })
          );
        } else {
          setErr(
            t('ru_error', {
              defaultValue:
                'Unrecognized code. Open text or base64 of pipe-separated data.'
            })
          );
        }
        return;
      }
      if (wedgeMrz) {
        setErr(
          t('mrz_error', {
            defaultValue:
              'Could not read MRZ. Check two/three short lines, or 88/90 characters.'
          })
        );
      }
    },
    [t, finishWithText, wedgeMrz, wedgeRu]
  );

  useKioskDocumentOcrWedge(wedgeActive, processScanLine, {
    enableMrz: wedgeMrz,
    enableRu: wedgeRu
  });
  useKioskSerialScannerStream(wedgeActive, processScanLine, unitId);

  /** If OCR is good enough, issue ticket / continue without a second button. */
  const tryApplyOcrResult = useCallback(
    (
      raw: string,
      meta: { confidence?: number; ocr: 'tesseract_js' | 'tesseract_cli' }
    ) => {
      if (hasAutoClosedRef.current) {
        return;
      }
      const ttrim = raw.trim();
      if (!ttrim) {
        return;
      }
      if (meta.ocr === 'tesseract_js' && meta.confidence != null) {
        if (
          meta.confidence >= AUTO_APPLY_MIN_CONF &&
          ttrim.length >= AUTO_APPLY_MIN_LEN
        ) {
          finishWithText(ttrim);
          return;
        }
      }
      const n = normalizeOcrStability(ttrim);
      if (n.length >= NATIVE_ONE_SHOT_MIN_LEN) {
        finishWithText(n);
        return;
      }
      if (n.length < AUTO_APPLY_MIN_LEN) {
        lastAutoNormRef.current = '';
        nativeStreakRef.current = 0;
        return;
      }
      if (n === lastAutoNormRef.current) {
        nativeStreakRef.current += 1;
      } else {
        lastAutoNormRef.current = n;
        nativeStreakRef.current = 1;
      }
      if (nativeStreakRef.current >= NATIVE_STABLE_MATCHES) {
        finishWithText(n);
      }
    },
    [finishWithText]
  );

  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        for (const tr of streamRef.current.getTracks()) {
          tr.stop();
        }
        streamRef.current = null;
      }
      {
        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = null;
        }
      }
      setStream(null);
      setErr(null);
      setErrKind('error');
      setBusy(false);
      busyRef.current = false;
      hasAutoClosedRef.current = false;
      lastAutoNormRef.current = '';
      nativeStreakRef.current = 0;
      return;
    }
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        streamRef.current = s;
        setStream(s);
        const el = videoRef.current;
        if (el) {
          el.srcObject = s;
          void el.play().catch(() => {
            // ignore
          });
        }
      } catch (e) {
        setErrKind('error');
        setErr(
          e instanceof Error
            ? e.message
            : t('error_camera', { defaultValue: 'Camera unavailable' })
        );
      }
    })();
    return () => {
      if (streamRef.current) {
        for (const tr of streamRef.current.getTracks()) {
          tr.stop();
        }
        streamRef.current = null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount: clear video
      const el = videoRef.current;
      if (el) {
        el.srcObject = null;
      }
    };
  }, [open, t]);

  const runRecognize = useCallback(async () => {
    if (busyRef.current || hasAutoClosedRef.current) {
      return;
    }
    const v = videoRef.current;
    if (!v || v.videoWidth < 2) {
      setErrKind('error');
      setErr(t('error_primes', { defaultValue: 'Wait for the camera.' }));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    setErrKind('error');
    const canvas = document.createElement('canvas');
    const w = Math.min(1600, v.videoWidth);
    const scale = w / v.videoWidth;
    canvas.width = w;
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      busyRef.current = false;
      setBusy(false);
      setErrKind('error');
      setErr(t('error', { defaultValue: 'Could not read image.' }));
      return;
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const b64 = canvasToJpegBase64(canvas);
    try {
      let out = '';
      let ocrMeta: {
        confidence?: number;
        ocr: 'tesseract_js' | 'tesseract_cli';
      };
      if (preferNative && isTauriKiosk()) {
        const r = await runKioskOcrTauriFromBase64(b64);
        out = (r.text ?? '').trim();
        ocrMeta = { ocr: 'tesseract_cli' };
      } else {
        const T = (await import('tesseract.js')).default;
        const { data: odata } = await T.recognize(canvas, 'eng+rus', {
          logger: () => {
            // quiet
          }
        });
        out = (odata.text ?? '').trim();
        ocrMeta = { ocr: 'tesseract_js', confidence: odata.confidence };
      }
      if (out) {
        tryApplyOcrResult(out, ocrMeta);
      }
      if (hasAutoClosedRef.current) {
        return;
      }
      if (!out) {
        setErrKind('soft');
        setErr(
          t('no_text_ocr', {
            defaultValue:
              'No text was read. Try again with better light and a steady frame.'
          })
        );
      } else if (nativeStreakRef.current >= 1 && lastAutoNormRef.current) {
        setErrKind('soft');
        setErr(
          t('confirm_scan_again', {
            defaultValue:
              'Not confident yet — use the same framing and tap the button again to confirm the read.'
          })
        );
      } else {
        setErrKind('soft');
        setErr(
          t('weak_ocr', {
            defaultValue:
              'The text is not clear enough. Adjust light and the document, then try again, or use the USB scanner if available.'
          })
        );
      }
    } catch (e) {
      setErrKind('error');
      setErr(
        e instanceof Error
          ? e.message
          : t('error', { defaultValue: 'Could not read text.' })
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [preferNative, t, tryApplyOcrResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KioskDialogContent
        className='max-w-lg'
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('title', { defaultValue: 'ID document' })}
          </DialogTitle>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {t('hint', {
              defaultValue:
                'The image is processed in memory and is not stored on the device. Tap start scan, hold the document steady, then a successful read continues to your ticket. No text is sent until then.'
            })}
          </p>
        </DialogHeader>

        {showSerialCallout ? (
          <div
            className='border-border bg-muted/30 flex items-start gap-3 rounded-lg border p-3'
            aria-label={t('serial_scanner_aria', {
              defaultValue: 'USB serial scanner'
            })}
          >
            <div className='text-muted-foreground border-border bg-background/80 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border'>
              <ScanLine className='h-5 w-5' aria-hidden />
            </div>
            <p className='text-muted-foreground min-w-0 text-sm leading-relaxed'>
              {t('serial_scanner_hint', {
                defaultValue:
                  'A serial scanner is configured. Scan the MRZ or license barcode — a good read will continue automatically.'
              })}
            </p>
          </div>
        ) : null}

        {showSerialCallout ? (
          <div className='flex items-center gap-3 py-0.5'>
            <Separator className='flex-1' />
            <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('or_label', { defaultValue: 'Or' })}
            </span>
            <Separator className='flex-1' />
          </div>
        ) : null}

        <div className='pt-0.5'>
          <p className='text-muted-foreground mb-1.5 text-sm font-medium'>
            {t('camera_section_label', { defaultValue: 'Camera' })}
          </p>
          <div className='bg-muted/40 relative flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-lg'>
            {err && !stream ? (
              <p className='text-destructive px-3 text-center text-sm'>{err}</p>
            ) : (
              <video
                ref={videoRef}
                className='h-full w-full object-contain'
                playsInline
                muted
                aria-label={t('title', { defaultValue: 'Camera preview' })}
              />
            )}
            {stream ? (
              <div
                className='pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center'
                aria-hidden
              >
                {busy ? (
                  <div className='text-muted-foreground border-background/80 flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs shadow-sm dark:bg-zinc-900/85'>
                    <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin' />
                    {t('status_scanning', { defaultValue: 'Reading…' })}
                  </div>
                ) : (
                  <div className='text-muted-foreground border-background/60 flex max-w-[95%] items-center justify-center gap-1.5 rounded-full border bg-white/70 px-2 py-1 text-center text-[0.7rem] shadow-sm sm:text-xs dark:bg-zinc-900/80'>
                    <Scan className='h-3.5 w-3.5 shrink-0' />
                    {t('status_ready', {
                      defaultValue:
                        'Frame the document, then tap the scan button (no background scanning).'
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {err && stream ? (
          <p
            className={
              errKind === 'soft'
                ? 'text-foreground/85 text-center text-sm'
                : 'text-destructive text-center text-sm'
            }
            role={errKind === 'error' ? 'alert' : 'status'}
          >
            {err}
          </p>
        ) : null}

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            type='button'
            variant='secondary'
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('close', { defaultValue: 'Close' })}
          </Button>
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              type='button'
              variant='default'
              className='gap-2'
              onClick={() => {
                void runRecognize();
              }}
              disabled={busy || !stream}
            >
              {busy ? (
                <Loader2
                  className='h-4 w-4 shrink-0 animate-spin'
                  aria-hidden
                />
              ) : (
                <Scan className='h-4 w-4' aria-hidden />
              )}
              {t('start_scan', { defaultValue: 'Start scan' })}
            </Button>
          </div>
        </DialogFooter>
      </KioskDialogContent>
    </Dialog>
  );
}
