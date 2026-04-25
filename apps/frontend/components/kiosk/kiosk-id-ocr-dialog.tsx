'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Scan } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isTauriKiosk } from '@/lib/kiosk-print';
import { useKioskBarcodeWedge } from '@/hooks/use-kiosk-barcode-wedge';
import { useKioskSerialScannerStream } from '@/hooks/use-kiosk-serial-scanner';
import { cn } from '@/lib/utils';

type KioskIdOcrDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Kiosk unit route id — serial scanner settings are per unit in Tauri. */
  unitId: string;
  /** When true and the shell is Tauri, call native tesseract. */
  preferNative: boolean;
  onUseText: (text: string) => void;
  /** Default true when unset: show MRZ and RU barcode tabs (plan + id OCR). */
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

const AUTO_SCAN_MS = 3200;
const AUTO_APPLY_MIN_LEN = 32;
const AUTO_APPLY_MIN_CONF = 58;
const NATIVE_STABLE_MATCHES = 2;
/** Heuristic: one long read is enough to apply (no confidence from native CLI). */
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [subTab, setSubTab] = useState('camera');
  const busyRef = useRef(false);
  const hasAutoClosedRef = useRef(false);
  const lastAutoNormRef = useRef<string>('');
  const nativeStreakRef = useRef(0);

  const applyIfEligible = useCallback(
    (
      raw: string,
      meta: { confidence?: number; ocr: 'tesseract_js' | 'tesseract_cli' },
      source: 'manual' | 'auto'
    ) => {
      if (source !== 'auto' || hasAutoClosedRef.current) {
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
          hasAutoClosedRef.current = true;
          onUseText(ttrim);
          onOpenChange(false);
          return;
        }
        // Low confidence: same stability path as native (two matching reads)
      }
      const n = normalizeOcrStability(ttrim);
      if (n.length >= NATIVE_ONE_SHOT_MIN_LEN) {
        hasAutoClosedRef.current = true;
        onUseText(n);
        onOpenChange(false);
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
        hasAutoClosedRef.current = true;
        onUseText(n);
        onOpenChange(false);
      }
    },
    [onOpenChange, onUseText]
  );

  const applyMrzRaw = useCallback(
    (raw: string) => {
      setErr(null);
      const out = buildMrzText(raw);
      if (out) {
        setText(out);
      } else {
        setErr(
          t('mrz_error', {
            defaultValue: 'Could not read MRZ. Scan two lines, or 88/90 chars.'
          })
        );
      }
    },
    [t]
  );

  const applyRuRaw = useCallback(
    (raw: string) => {
      setErr(null);
      const p = parseRuDrivingLicenseBarcode(raw);
      if (p.documentId && p.lastName) {
        setText(formatRuDrivingLicenseText(p));
        return;
      }
      if (p.documentId || p.trailer) {
        setText(
          formatRuDrivingLicenseText(p) ||
            t('ru_partial', { defaultValue: 'Partial data' })
        );
        return;
      }
      setErr(
        t('ru_error', {
          defaultValue:
            'Unrecognized code. Open text or base64 of pipe-separated data.'
        })
      );
    },
    [t]
  );

  const mrzActive = open && wedgeMrz && subTab === 'mrz';
  const ruActive = open && wedgeRu && subTab === 'ru';
  useKioskBarcodeWedge(mrzActive, applyMrzRaw, { mode: 'mrz' });
  useKioskBarcodeWedge(ruActive, applyRuRaw, { mode: 'longText' });
  useKioskSerialScannerStream(mrzActive, applyMrzRaw, unitId);
  useKioskSerialScannerStream(ruActive, applyRuRaw, unitId);

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
      setText('');
      setErr(null);
      setBusy(false);
      busyRef.current = false;
      hasAutoClosedRef.current = false;
      lastAutoNormRef.current = '';
      nativeStreakRef.current = 0;
      setSubTab('camera');
      return;
    }
    void (async () => {
      if (subTab !== 'camera') {
        return;
      }
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
  }, [open, subTab, t]);

  const runRecognize = useCallback(
    async (source: 'manual' | 'auto' = 'manual') => {
      if (source === 'auto' && (busyRef.current || hasAutoClosedRef.current)) {
        return;
      }
      const v = videoRef.current;
      if (!v || v.videoWidth < 2) {
        if (source === 'manual') {
          setErr(t('error_primes', { defaultValue: 'Wait for the camera.' }));
        }
        return;
      }
      busyRef.current = true;
      setBusy(true);
      if (source === 'manual') {
        setErr(null);
        setText('');
        lastAutoNormRef.current = '';
        nativeStreakRef.current = 0;
      }
      const canvas = document.createElement('canvas');
      const w = Math.min(1600, v.videoWidth);
      const scale = w / v.videoWidth;
      canvas.width = w;
      canvas.height = Math.round(v.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        busyRef.current = false;
        setBusy(false);
        if (source === 'manual') {
          setErr(t('error', { defaultValue: 'Could not read image.' }));
        }
        return;
      }
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const b64 = canvasToJpegBase64(canvas);
      try {
        if (preferNative && isTauriKiosk()) {
          const r = await runKioskOcrTauriFromBase64(b64);
          const out = (r.text ?? '').trim();
          setText(out);
          if (out) {
            applyIfEligible(out, { ocr: 'tesseract_cli' }, source);
          }
        } else {
          const T = (await import('tesseract.js')).default;
          const { data: odata } = await T.recognize(canvas, 'eng+rus', {
            logger: () => {
              // quiet
            }
          });
          const out = (odata.text ?? '').trim();
          setText(out);
          if (out) {
            applyIfEligible(
              out,
              {
                confidence: odata.confidence,
                ocr: 'tesseract_js'
              },
              source
            );
          }
        }
      } catch (e) {
        if (source === 'manual') {
          setErr(
            e instanceof Error
              ? e.message
              : t('error', { defaultValue: 'Could not read text.' })
          );
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [applyIfEligible, preferNative, t]
  );

  useEffect(() => {
    if (!open || subTab !== 'camera' || !stream || hasAutoClosedRef.current) {
      return;
    }
    const id = window.setInterval(() => {
      if (!busyRef.current && !hasAutoClosedRef.current) {
        void runRecognize('auto');
      }
    }, AUTO_SCAN_MS);
    const boot = window.setTimeout(() => {
      if (!busyRef.current) {
        void runRecognize('auto');
      }
    }, 900);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
    };
  }, [open, subTab, stream, runRecognize]);

  const showWedge = wedgeMrz || wedgeRu;
  const nTabColumns = 1 + (wedgeMrz ? 1 : 0) + (wedgeRu ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <KioskDialogContent
        className='max-w-lg'
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('title', { defaultValue: 'Document scan' })}
          </DialogTitle>
          <p className='text-muted-foreground text-sm leading-relaxed'>
            {t('hint', {
              defaultValue:
                'The image is processed in memory and is not saved on this device. The camera re-reads periodically; good reads can copy text and close. You can rescan if needed.'
            })}
          </p>
        </DialogHeader>

        {showWedge ? (
          <Tabs value={subTab} onValueChange={setSubTab} className='w-full'>
            <TabsList
              className={cn(
                'grid w-full',
                nTabColumns === 2 && 'grid-cols-2',
                nTabColumns === 3 && 'grid-cols-3'
              )}
            >
              <TabsTrigger value='camera' type='button'>
                {t('tab_camera', { defaultValue: 'Camera' })}
              </TabsTrigger>
              {wedgeMrz ? (
                <TabsTrigger value='mrz' type='button'>
                  {t('tab_mrz', { defaultValue: 'ICAO (MRZ)' })}
                </TabsTrigger>
              ) : null}
              {wedgeRu ? (
                <TabsTrigger value='ru' type='button'>
                  {t('tab_ru_dl', { defaultValue: 'RU license' })}
                </TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value='camera' className='pt-2'>
              <div className='bg-muted/40 relative flex aspect-video w-full max-w-full items-center justify-center overflow-hidden rounded-lg'>
                {err && !stream && subTab === 'camera' ? (
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
                {stream && subTab === 'camera' ? (
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
                        {t('status_hold_doc', {
                          defaultValue:
                            'Keep the document steady — scanning automatically'
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </TabsContent>
            {wedgeMrz ? (
              <TabsContent value='mrz' className='space-y-2 pt-2'>
                <p className='text-muted-foreground text-sm'>
                  {t('mrz_hint', {
                    defaultValue:
                      'Use the 2 or 3 MRZ lines from your passport/ID, or 88/90 characters at once.'
                  })}
                </p>
              </TabsContent>
            ) : null}
            {wedgeRu ? (
              <TabsContent value='ru' className='space-y-2 pt-2'>
                <p className='text-muted-foreground text-sm'>
                  {t('ru_hint', {
                    defaultValue:
                      'Point the scanner at the RU license barcode. Open or base64; data stays in this session only.'
                  })}
                </p>
              </TabsContent>
            ) : null}
          </Tabs>
        ) : (
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
                    {t('status_hold_doc', {
                      defaultValue:
                        'Keep the document steady — scanning automatically'
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {showWedge && subTab === 'camera' && err && stream ? (
          <p className='text-destructive text-center text-sm'>{err}</p>
        ) : null}
        {showWedge && (subTab === 'mrz' || subTab === 'ru') && err ? (
          <p className='text-destructive text-center text-sm'>{err}</p>
        ) : null}
        {!showWedge && err && stream ? (
          <p className='text-destructive text-center text-sm'>{err}</p>
        ) : null}

        {text ? (
          <textarea
            className='border-input bg-background max-h-40 w-full rounded-md border p-2 text-sm'
            readOnly
            value={text}
            rows={5}
            aria-label={t('result_aria', { defaultValue: 'Recognized text' })}
          />
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
            {subTab === 'camera' ? (
              <Button
                type='button'
                variant='outline'
                onClick={() => {
                  void runRecognize('manual');
                }}
                disabled={busy || !stream}
              >
                {busy ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
                {t('capture_again', { defaultValue: 'Rescan' })}
              </Button>
            ) : null}
            <Button
              type='button'
              variant='secondary'
              disabled={!text.trim() || busy}
              onClick={() => {
                onUseText(text.trim());
                onOpenChange(false);
              }}
            >
              {t('use_text', { defaultValue: 'Use text' })}
            </Button>
          </div>
        </DialogFooter>
      </KioskDialogContent>
    </Dialog>
  );
}
