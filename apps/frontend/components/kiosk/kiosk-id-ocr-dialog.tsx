'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Scan, ScanLine } from 'lucide-react';
import {
  extractIcaOmrzFromOcrText,
  formatRuDrivingLicenseText,
  isLikelyRuDrivingLicenseFromScanString,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isTauriKiosk } from '@/lib/kiosk-print';
import { useKioskDocumentOcrWedge } from '@/hooks/use-kiosk-barcode-wedge';
import { useKioskSerialScannerStream } from '@/hooks/use-kiosk-serial-scanner';
import {
  KIOSK_TAURI_DEVICE_CHANGED_EVENT,
  readKioskTauriLocalDevice
} from '@/lib/kiosk-tauri-device-config';
import { tryDecodeBarcodeStringFromCanvasAsync } from '@/lib/kiosk-canvas-barcode-decode';

type KioskIdOcrDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Kiosk unit route id — serial scanner settings are per unit in Tauri. */
  unitId: string;
  /** When true and the shell is Tauri, call native tesseract. */
  preferNative: boolean;
  onUseText: (text: string) => void;
  /**
   * Fired on the Document tab when “Start scan” / OCR did not continue the flow
   * (no recognition success). Use on the parent to count attempts before issuing
   * a “document not read” ticket.
   */
  onUnsuccessfulDocumentScan?: () => void;
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

export function KioskIdOcrDialog({
  open,
  onOpenChange,
  unitId,
  preferNative,
  onUseText,
  onUnsuccessfulDocumentScan,
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
  const [ocrTab, setOcrTab] = useState<'barcode' | 'document'>('barcode');
  const busyRef = useRef(false);
  const hasAutoClosedRef = useRef(false);
  const lastAutoNormRef = useRef<string>('');
  const nativeStreakRef = useRef(0);
  const wedgeActive = open && (wedgeMrz || wedgeRu);
  const hasSerialPath = (() => {
    void deviceCfgEpoch;
    return Boolean(readKioskTauriLocalDevice(unitId)?.serialPath?.trim());
  })();
  const hasSerialScanner = isTauriKiosk() && hasSerialPath;
  /** Barcode tab + USB serial: camera off; instruction only. */
  const barcodeUseDeviceOnly = hasSerialScanner && ocrTab === 'barcode';
  const useCamera =
    open &&
    (ocrTab === 'document' || (ocrTab === 'barcode' && !hasSerialScanner));

  useEffect(() => {
    if (open) {
      setOcrTab('barcode');
    }
  }, [open]);

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
        const m = extractIcaOmrzFromOcrText(line);
        if (m) {
          finishWithText(m);
          return;
        }
      }
      if (wedgeRu) {
        if (!isLikelyRuDrivingLicenseFromScanString(line)) {
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
                  'Unrecognized code. Open pipe text or base64 of pipe-separated data.'
              })
            );
          }
          return;
        }
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
    ): boolean => {
      if (hasAutoClosedRef.current) {
        return false;
      }
      const ttrim = raw.trim();
      if (!ttrim) {
        return false;
      }
      if (meta.ocr === 'tesseract_js' && meta.confidence != null) {
        if (
          meta.confidence >= AUTO_APPLY_MIN_CONF &&
          ttrim.length >= AUTO_APPLY_MIN_LEN
        ) {
          finishWithText(ttrim);
          return true;
        }
      }
      const n = normalizeOcrStability(ttrim);
      if (n.length >= NATIVE_ONE_SHOT_MIN_LEN) {
        finishWithText(n);
        return true;
      }
      if (n.length < AUTO_APPLY_MIN_LEN) {
        lastAutoNormRef.current = '';
        nativeStreakRef.current = 0;
        return false;
      }
      if (n === lastAutoNormRef.current) {
        nativeStreakRef.current += 1;
      } else {
        lastAutoNormRef.current = n;
        nativeStreakRef.current = 1;
      }
      if (nativeStreakRef.current >= NATIVE_STABLE_MATCHES) {
        finishWithText(n);
        return true;
      }
      return false;
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
    if (!useCamera) {
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
  }, [open, t, useCamera]);

  const runRecognize = useCallback(async () => {
    if (busyRef.current || hasAutoClosedRef.current) {
      return;
    }
    if (barcodeUseDeviceOnly) {
      return;
    }
    const v = videoRef.current;
    if (!v || v.videoWidth < 2) {
      if (ocrTab === 'document') {
        onUnsuccessfulDocumentScan?.();
      }
      setErrKind('error');
      setErr(t('error_primes', { defaultValue: 'Wait for the camera.' }));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    setErrKind('error');
    await new Promise<void>((r) => {
      requestAnimationFrame(() => {
        r();
      });
    });
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const canvasFull = document.createElement('canvas');
    canvasFull.width = vw;
    canvasFull.height = vh;
    const ctxFull = canvasFull.getContext('2d');
    if (!ctxFull) {
      if (ocrTab === 'document') {
        onUnsuccessfulDocumentScan?.();
      }
      busyRef.current = false;
      setBusy(false);
      setErrKind('error');
      setErr(t('error', { defaultValue: 'Could not read image.' }));
      return;
    }
    ctxFull.drawImage(v, 0, 0, vw, vh);

    if (ocrTab === 'barcode') {
      try {
        const rawBar = await tryDecodeBarcodeStringFromCanvasAsync(canvasFull);
        if (rawBar) {
          const p = isLikelyRuDrivingLicenseFromScanString(rawBar)
            ? parseRuDrivingLicenseBarcode(rawBar)
            : null;
          if (p) {
            if (p.documentId && p.lastName) {
              finishWithText(formatRuDrivingLicenseText(p));
              busyRef.current = false;
              setBusy(false);
              return;
            }
            if (p.documentId || p.trailer) {
              finishWithText(
                formatRuDrivingLicenseText(p) ||
                  t('ru_partial', { defaultValue: 'Partial data' })
              );
              busyRef.current = false;
              setBusy(false);
              return;
            }
          }
          if (!hasAutoClosedRef.current) {
            const plain = (rawBar ?? '').trim();
            if (plain.length > 0) {
              finishWithText(plain);
              busyRef.current = false;
              setBusy(false);
              return;
            }
            setErrKind('soft');
            setErr(
              t('barcode_not_ru_dl', {
                defaultValue:
                  'A barcode was read, but it is not a RU license code. Use the Document tab for a photo or MRZ, or try again.'
              })
            );
          }
        } else if (!hasAutoClosedRef.current) {
          setErrKind('soft');
          setErr(
            t('barcode_not_found', {
              defaultValue:
                'No barcode was detected. Move closer, improve light, keep the code flat, or use the Document tab for OCR/MRZ.'
            })
          );
        }
      } catch {
        if (!hasAutoClosedRef.current) {
          setErrKind('error');
          setErr(
            t('error', {
              defaultValue: 'Could not read text. Try again with better light.'
            })
          );
        }
      }
      busyRef.current = false;
      setBusy(false);
      return;
    }

    if (hasAutoClosedRef.current) {
      return;
    }

    const canvas = document.createElement('canvas');
    const w = Math.min(1920, vw);
    const scale = w / vw;
    canvas.width = w;
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (ocrTab === 'document') {
        onUnsuccessfulDocumentScan?.();
      }
      busyRef.current = false;
      setBusy(false);
      setErrKind('error');
      setErr(t('error', { defaultValue: 'Could not read image.' }));
      return;
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const b64 = canvasToJpegBase64(canvas);
    const weakOcrMessage = t('weak_ocr', {
      defaultValue:
        'The text is not clear enough. Adjust the light and the document, then try “Start scan” again, or use the USB scanner if it is set up.'
    });
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
        const mrz = extractIcaOmrzFromOcrText(out);
        if (mrz) {
          finishWithText(mrz);
        } else if (isLikelyRuDrivingLicenseFromScanString(out)) {
          const p = parseRuDrivingLicenseBarcode(out);
          if (p.documentId && p.lastName) {
            finishWithText(formatRuDrivingLicenseText(p));
          } else if (p.documentId || p.trailer) {
            finishWithText(
              formatRuDrivingLicenseText(p) ||
                t('ru_partial', { defaultValue: 'Partial data' })
            );
          } else {
            const done = tryApplyOcrResult(out, ocrMeta);
            if (!hasAutoClosedRef.current && !done) {
              setErrKind('soft');
              setErr(weakOcrMessage);
            }
          }
        } else {
          const done = tryApplyOcrResult(out, ocrMeta);
          if (!hasAutoClosedRef.current && !done) {
            setErrKind('soft');
            setErr(weakOcrMessage);
          }
        }
      } else {
        setErrKind('soft');
        setErr(
          t('no_text_ocr', {
            defaultValue:
              'No text was read. Try again with better light and a steady frame.'
          })
        );
      }
      if (hasAutoClosedRef.current) {
        return;
      }
    } catch (e) {
      setErrKind('error');
      setErr(
        e instanceof Error
          ? e.message
          : t('error', { defaultValue: 'Could not read text.' })
      );
    } finally {
      if (ocrTab === 'document' && !hasAutoClosedRef.current) {
        onUnsuccessfulDocumentScan?.();
      }
      busyRef.current = false;
      setBusy(false);
    }
  }, [
    barcodeUseDeviceOnly,
    finishWithText,
    ocrTab,
    preferNative,
    t,
    tryApplyOcrResult,
    onUnsuccessfulDocumentScan
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KioskDialogContent
        className='w-full sm:max-w-2xl'
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('title', { defaultValue: 'ID document' })}
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={ocrTab}
          onValueChange={(v) => {
            if (v === 'barcode' || v === 'document') {
              if (!busy) {
                setOcrTab(v);
                setErr(null);
              }
            }
          }}
          className='w-full min-w-0'
        >
          <TabsList className='grid w-full min-w-0 grid-cols-2 p-[3px] sm:min-h-10'>
            <TabsTrigger
              value='barcode'
              disabled={busy}
              className='min-w-0 flex-1'
            >
              {t('tab_barcode', { defaultValue: 'Barcode' })}
            </TabsTrigger>
            <TabsTrigger
              value='document'
              disabled={busy}
              className='min-w-0 flex-1'
            >
              {t('tab_document', { defaultValue: 'Document' })}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {!barcodeUseDeviceOnly ? (
          <p className='text-muted-foreground -mt-1 text-sm leading-relaxed'>
            {ocrTab === 'barcode'
              ? t('tab_barcode_hint', {
                  defaultValue:
                    'Aim the barcode, then start scan. Switch to document for the photo or MRZ lines.'
                })
              : t('tab_document_hint', {
                  defaultValue:
                    'Aim the page (photo, MRZ), then start scan. Use barcode tab to read 2D codes on the back.'
                })}
          </p>
        ) : null}
        {hasSerialScanner && ocrTab === 'document' ? (
          <p className='text-muted-foreground -mt-1 text-xs leading-relaxed'>
            {t('serial_scanner_hint', {
              defaultValue:
                'A serial scanner is configured. You can also use it for MRZ or a barcode line.'
            })}
          </p>
        ) : null}

        {barcodeUseDeviceOnly ? (
          <div
            className='bg-muted/40 border-border flex aspect-video w-full max-w-full flex-col items-center justify-center gap-3 rounded-lg border p-4 text-center'
            aria-live='polite'
            aria-label={t('barcode_use_device_aria', {
              defaultValue: 'Scan with connected reader'
            })}
          >
            <div className='text-muted-foreground border-border bg-background/80 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border'>
              <ScanLine className='h-7 w-7' aria-hidden strokeWidth={1.5} />
            </div>
            <p className='text-foreground max-w-md text-base leading-snug font-medium'>
              {t('barcode_use_device', {
                defaultValue: 'Scan with the connected device.'
              })}
            </p>
            <p className='text-muted-foreground max-w-md text-sm leading-relaxed'>
              {t('barcode_use_device_sub', {
                defaultValue:
                  'A successful read will continue this step automatically.'
              })}
            </p>
          </div>
        ) : (
          <div className='pt-0.5'>
            <p className='text-muted-foreground mb-1.5 text-sm font-medium'>
              {t('camera_section_label', { defaultValue: 'Camera' })}
            </p>
            <div className='bg-muted/40 relative flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-lg'>
              {err && !stream ? (
                <p className='text-destructive px-3 text-center text-sm'>
                  {err}
                </p>
              ) : (
                <video
                  ref={videoRef}
                  className='h-full w-full object-contain'
                  playsInline
                  muted
                  aria-label={t('title', { defaultValue: 'Camera preview' })}
                />
              )}
              {stream && busy ? (
                <div
                  className='pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center'
                  aria-hidden
                >
                  <div className='text-muted-foreground border-background/80 flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs shadow-sm dark:bg-zinc-900/85'>
                    <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin' />
                    {t('status_scanning', { defaultValue: 'Reading…' })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {err && stream && errKind === 'error' ? (
          <p className='text-destructive text-center text-sm' role='alert'>
            {err}
          </p>
        ) : null}
        {err && stream && errKind === 'soft' ? (
          <p
            className='text-muted-foreground text-center text-sm leading-relaxed'
            role='status'
          >
            {err}
          </p>
        ) : null}

        <DialogFooter
          className={
            barcodeUseDeviceOnly
              ? 'gap-2 sm:justify-end'
              : 'gap-2 sm:justify-between'
          }
        >
          <Button
            type='button'
            variant='secondary'
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('close', { defaultValue: 'Close' })}
          </Button>
          {barcodeUseDeviceOnly ? null : (
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
          )}
        </DialogFooter>
      </KioskDialogContent>
    </Dialog>
  );
}
