'use client';

import {
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect
} from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Delete, Smartphone, Hash, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KioskDialogContent } from '@/components/kiosk/kiosk-dialog-content';
import {
  preRegistrationsApi,
  type PreRegistration,
  type Ticket
} from '@/lib/api';
import { useKioskBarcodeWedge } from '@/hooks/use-kiosk-barcode-wedge';
import { useKioskSerialScannerStream } from '@/hooks/use-kiosk-serial-scanner';
import { cn } from '@/lib/utils';

type TabKey = 'code' | 'phone';

interface PreRegRedemptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  onSuccess: (ticket: Ticket) => void;
  /** Filled from URL (prCode or resolved prToken). */
  initialCode?: string;
  showPhoneTab?: boolean;
  /** If true, submit 6-digit code from URL without another tap (deeplink / QR). */
  autoRedeemFromDeeplink?: boolean;
  /** If set, when the 6-digit code can be read from it, prefill the “code” tab (no auto-submit). */
  kioskOcrText?: string;
}

function normalizeWedgeToSix(line: string): string {
  const d = line.replace(/\D/g, '');
  if (d.length >= 6) {
    return d.slice(-6);
  }
  return d;
}

export function PreRegRedemptionModal({
  isOpen,
  onClose,
  unitId,
  onSuccess,
  initialCode,
  showPhoneTab,
  autoRedeemFromDeeplink,
  kioskOcrText
}: PreRegRedemptionModalProps) {
  const t = useTranslations('kiosk.pre_registration');
  const [tab, setTab] = useState<TabKey>('code');
  const [error, setError] = useState('');

  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lookupToken, setLookupToken] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [candidates, setCandidates] = useState<PreRegistration[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalIdRef = useRef<number | null>(null);
  const detectInFlightRef = useRef(false);
  const [scanBusy, setScanBusy] = useState(false);
  const scanStopRef = useRef<() => void>(() => {});

  type BarcodeCtor = new (opts: { formats: string[] }) => {
    detect: (src: ImageBitmapSource) => Promise<unknown[]>;
  };

  // initialCode: parent may pass a `key` so a new 6-digit code (URL) re-mounts this form.
  const [code, setCode] = useState(() => {
    const c = (initialCode || '').replace(/\D/g, '').slice(0, 6);
    return c.length > 0 ? c : '';
  });

  const closeModal = useCallback(() => {
    setCode('');
    setError('');
    setTab('code');
    setPhone('');
    setSessionId(null);
    setLookupToken(null);
    setOtp('');
    setCandidates([]);
    setSelId(null);
    scanStopRef.current();
    onClose();
  }, [onClose]);

  const onRedeemError = (message: string) => {
    if (message.includes('pre-registration not found')) {
      setError(t('errors.not_found'));
    } else if (message.includes('too early')) {
      setError(t('errors.too_early'));
    } else if (message.includes('too late')) {
      setError(t('errors.too_late'));
    } else {
      setError(
        t('invalid_code', {
          defaultValue: 'Invalid code. Please try again.'
        })
      );
    }
  };

  const redeemMutation = useMutation({
    mutationFn: (c: string) => preRegistrationsApi.redeem(unitId, c),
    onSuccess: (data) => {
      if (data.success && data.ticket) {
        onSuccess(data.ticket);
        closeModal();
      } else {
        onRedeemError(data.message || '');
      }
    },
    onError: () => {
      setError(
        t('invalid_code', { defaultValue: 'Invalid code. Please try again.' })
      );
    }
  });

  const autoRedeemAttempted = useRef(false);
  const kioskOcrPreAppliedRef = useRef<string | null>(null);
  const autoRedeemCode = (initialCode || '').replace(/\D/g, '').slice(0, 6);
  useLayoutEffect(() => {
    if (!isOpen) {
      kioskOcrPreAppliedRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !kioskOcrText) {
      return;
    }
    if (kioskOcrPreAppliedRef.current === kioskOcrText) {
      return;
    }
    if (tab !== 'code') {
      return;
    }
    const six = normalizeWedgeToSix(kioskOcrText);
    if (six.length !== 6) {
      return;
    }
    kioskOcrPreAppliedRef.current = kioskOcrText;
    setCode(six);
    setError('');
  }, [isOpen, kioskOcrText, tab]);

  useLayoutEffect(() => {
    if (!isOpen) {
      autoRedeemAttempted.current = false;
      return;
    }
    if (!autoRedeemFromDeeplink) {
      return;
    }
    if (autoRedeemCode.length !== 6 || redeemMutation.isPending) {
      return;
    }
    if (autoRedeemAttempted.current) {
      return;
    }
    autoRedeemAttempted.current = true;
    redeemMutation.mutate(autoRedeemCode);
  }, [isOpen, autoRedeemFromDeeplink, autoRedeemCode, redeemMutation]);

  const applyScanned = useCallback(
    (line: string) => {
      const s = normalizeWedgeToSix(line);
      if (s.length === 6) {
        setCode(s);
        redeemMutation.mutate(s);
      } else {
        setCode(s.slice(0, 6));
        setError(
          t('scan_unrecognized', { defaultValue: 'Could not read code' })
        );
      }
    },
    [redeemMutation, t]
  );
  const applyScannedRef = useRef(applyScanned);
  useEffect(() => {
    applyScannedRef.current = applyScanned;
  }, [applyScanned]);

  const stopScanSession = useCallback(() => {
    detectInFlightRef.current = false;
    if (detectIntervalIdRef.current != null) {
      clearInterval(detectIntervalIdRef.current);
      detectIntervalIdRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
    setScanBusy(false);
  }, []);

  useEffect(() => {
    scanStopRef.current = stopScanSession;
  }, [stopScanSession]);

  useEffect(() => {
    if (!isOpen) {
      stopScanSession();
    }
  }, [isOpen, stopScanSession]);

  useEffect(() => {
    return () => {
      scanStopRef.current();
    };
  }, []);

  /**
   * Video lives in a portal (above kiosk dialogs) — attach stream and BarcodeDetector
   * only after the `<video>` in that layer has mounted.
   */
  useLayoutEffect(() => {
    if (!scanBusy) {
      return;
    }
    const stream = streamRef.current;
    if (!stream) {
      return;
    }
    const BD = (window as unknown as { BarcodeDetector?: BarcodeCtor })
      .BarcodeDetector;
    if (!BD) {
      setError(
        t('scan_no_api', { defaultValue: 'Camera scan is not available here.' })
      );
      stopScanSession();
      return;
    }

    const playWithAbortTolerated = (el: HTMLVideoElement) => {
      const p = el.play();
      if (p && typeof p.then === 'function') {
        void p.catch((e: unknown) => {
          const n =
            e && typeof e === 'object' && 'name' in e
              ? (e as { name: string }).name
              : '';
          if (n === 'AbortError') {
            return;
          }
        });
      }
    };

    const startWithVideo = (v: HTMLVideoElement) => {
      const det = new BD({ formats: ['qr_code', 'code_128', 'code_39'] });
      if (v.srcObject !== stream) {
        v.srcObject = stream;
      }
      v.playsInline = true;
      if (v.paused) {
        playWithAbortTolerated(v);
      }
      const id = window.setInterval(() => {
        const el = videoRef.current;
        if (!el?.videoWidth) {
          return;
        }
        if (detectInFlightRef.current) {
          return;
        }
        detectInFlightRef.current = true;
        void (async () => {
          try {
            const codes = await det.detect(el);
            if (codes.length) {
              const first = codes[0] as { rawValue?: string } | undefined;
              const r = first?.rawValue;
              if (r) {
                applyScannedRef.current(r);
                stopScanSession();
              }
            }
          } catch {
            // BarcodeDetector may reject; ignore and retry on next tick.
          } finally {
            detectInFlightRef.current = false;
          }
        })();
      }, 500);
      detectIntervalIdRef.current = id;
    };

    const v = videoRef.current;
    if (v) {
      startWithVideo(v);
    } else {
      const raf = requestAnimationFrame(() => {
        const v1 = videoRef.current;
        if (v1) {
          startWithVideo(v1);
        }
      });
      return () => {
        cancelAnimationFrame(raf);
        if (detectIntervalIdRef.current != null) {
          clearInterval(detectIntervalIdRef.current);
          detectIntervalIdRef.current = null;
        }
      };
    }
    return () => {
      if (detectIntervalIdRef.current != null) {
        clearInterval(detectIntervalIdRef.current);
        detectIntervalIdRef.current = null;
      }
    };
  }, [scanBusy, stopScanSession, t]);

  const scanActive = isOpen && tab === 'code' && !redeemMutation.isPending;
  useKioskBarcodeWedge(scanActive, applyScanned);
  useKioskSerialScannerStream(scanActive, applyScanned, unitId);

  const startCameraScan = async () => {
    const w = window as unknown as { BarcodeDetector?: BarcodeCtor };
    const BD = typeof window !== 'undefined' ? w.BarcodeDetector : undefined;
    if (!BD) {
      setError(
        t('scan_no_api', { defaultValue: 'Camera scan is not available here.' })
      );
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      setScanBusy(true);
    } catch {
      setError(t('scan_no_camera', { defaultValue: 'No camera available.' }));
      streamRef.current = null;
    }
  };

  const handleDigitClick = (digit: string) => {
    if (code.length < 6) {
      setCode((prev) => prev + digit);
      setError('');
    }
  };

  const handleBackspace = () => {
    setCode((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleSubmit = () => {
    if (code.length === 6) {
      redeemMutation.mutate(code);
    }
  };

  const sendOtp = useMutation({
    mutationFn: () => preRegistrationsApi.kioskPhoneStart(unitId, phone),
    onSuccess: (d) => {
      setSessionId(d.sessionId);
      setError('');
    },
    onError: () =>
      setError(t('phone_error', { defaultValue: 'Could not send code' }))
  });

  const verifyOtp = useMutation({
    mutationFn: () => {
      if (!sessionId) {
        return Promise.reject(new Error('no session'));
      }
      return preRegistrationsApi.kioskPhoneVerify(unitId, sessionId, otp);
    },
    onSuccess: async (d) => {
      setLookupToken(d.lookupToken);
      const list = await preRegistrationsApi.kioskPhoneList(
        unitId,
        d.lookupToken
      );
      setCandidates(list);
      setError('');
    },
    onError: () => setError(t('otp_error', { defaultValue: 'Wrong code' }))
  });

  const phoneRedeem = useMutation({
    mutationFn: () => {
      if (!lookupToken || !selId) {
        return Promise.reject(new Error('missing'));
      }
      return preRegistrationsApi.kioskPhoneRedeem(unitId, lookupToken, selId);
    },
    onSuccess: (data) => {
      if (data.success && data.ticket) {
        onSuccess(data.ticket);
        closeModal();
      } else {
        onRedeemError(data.message || '');
      }
    }
  });

  /**
   * Camera must be a *child* of `DialogContent`, not a portal to `document.body`:
   * Radix modal `Dialog` sets `disableOutsidePointerEvents` and blocks all hits outside
   * the dialog layer, so a portaled overlay was not clickable.
   */
  const cameraScanOverlay = scanBusy ? (
    <div
      className='absolute inset-0 z-50 flex flex-col bg-black/75'
      role='dialog'
      aria-modal='true'
      aria-label={t('camera_scan_aria', { defaultValue: 'Scan with camera' })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          stopScanSession();
        }
      }}
    >
      <div
        className='flex min-h-0 flex-1 flex-col items-center justify-center p-3 sm:p-5'
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            stopScanSession();
          }
        }}
      >
        <div className='relative w-full max-w-lg px-1'>
          <video
            ref={videoRef}
            className='pointer-events-none inline-block max-h-[min(78dvh,520px)] w-full rounded-2xl border-2 border-white/20 object-cover ring-1 ring-white/10'
            style={{ aspectRatio: '4 / 3' }}
            playsInline
            muted
          />
          <Button
            type='button'
            size='icon'
            variant='secondary'
            className='absolute end-2 top-2 z-20 size-12 rounded-full border border-white/30 bg-zinc-900/90 text-white shadow-lg hover:bg-zinc-800'
            onClick={(e) => {
              e.stopPropagation();
              stopScanSession();
            }}
            aria-label={t('close_camera')}
          >
            <X className='size-6' aria-hidden />
          </Button>
        </div>
      </div>
      <p className='shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-zinc-200'>
        {t('scan_aim_hint')}
      </p>
    </div>
  ) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <KioskDialogContent
        className='flex max-h-[min(92dvh,720px)] w-[calc(100%-1rem)] max-w-[480px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]'
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <div className='relative flex min-h-0 w-full flex-1 flex-col overflow-hidden'>
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain px-4 pt-4 pb-2 sm:px-5 sm:pt-5'>
            <DialogHeader className='mb-3 shrink-0 space-y-0 sm:mb-4'>
              <DialogTitle className='text-center text-xl leading-tight sm:text-2xl'>
                {t('title_appointment', {
                  defaultValue: 'Check in with booking'
                })}
              </DialogTitle>
              <p className='text-muted-foreground text-center text-sm'>
                {t('subtitle_code_hint', {
                  defaultValue: 'Code from SMS or email (6 digits)'
                })}
              </p>
            </DialogHeader>

            {showPhoneTab ? (
              <div className='w-full shrink-0'>
                <div className='mb-3 grid w-full grid-cols-2 gap-2'>
                  <Button
                    type='button'
                    variant={tab === 'code' ? 'default' : 'outline'}
                    className='kiosk-touch-min min-h-11 gap-1.5 sm:min-h-12'
                    onClick={() => setTab('code')}
                  >
                    <Hash className='size-4' aria-hidden />
                    {t('tab_code', { defaultValue: 'Code' })}
                  </Button>
                  <Button
                    type='button'
                    variant={tab === 'phone' ? 'default' : 'outline'}
                    className='kiosk-touch-min min-h-11 gap-1.5 sm:min-h-12'
                    onClick={() => setTab('phone')}
                  >
                    <Smartphone className='size-4' aria-hidden />
                    {t('tab_phone', { defaultValue: 'Phone' })}
                  </Button>
                </div>

                <div
                  className={
                    tab === 'phone'
                      ? 'max-h-[min(50dvh,24rem)] min-h-0 space-y-3 overflow-x-hidden overflow-y-auto pt-0'
                      : 'hidden'
                  }
                >
                  {!sessionId && (
                    <>
                      <Input
                        type='tel'
                        className='kiosk-touch-min h-12 text-lg sm:h-14'
                        placeholder={t('phone_placeholder', {
                          defaultValue: 'Phone'
                        })}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <Button
                        type='button'
                        className='kiosk-touch-min h-12 w-full sm:h-14'
                        onClick={() => sendOtp.mutate()}
                        disabled={!phone.trim() || sendOtp.isPending}
                      >
                        {sendOtp.isPending ? (
                          <Loader2 className='size-6 animate-spin' />
                        ) : (
                          t('send_sms', { defaultValue: 'Get SMS code' })
                        )}
                      </Button>
                    </>
                  )}
                  {sessionId && !lookupToken && (
                    <>
                      <p className='text-muted-foreground text-center text-sm'>
                        {t('enter_sms_code', {
                          defaultValue: 'Enter the 6 digits from SMS'
                        })}
                      </p>
                      <Input
                        className='kiosk-touch-min h-12 text-center font-mono text-2xl tracking-widest sm:h-14 sm:text-3xl'
                        inputMode='numeric'
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                      />
                      <Button
                        className='kiosk-touch-min h-12 w-full sm:h-14'
                        onClick={() => verifyOtp.mutate()}
                        disabled={otp.length < 4 || verifyOtp.isPending}
                      >
                        {verifyOtp.isPending ? (
                          <Loader2 className='size-6 animate-spin' />
                        ) : (
                          t('verify', { defaultValue: 'Confirm' })
                        )}
                      </Button>
                    </>
                  )}
                  {lookupToken && (
                    <div className='space-y-2'>
                      <p className='text-center text-sm font-medium'>
                        {t('choose_booking', {
                          defaultValue: 'Choose your slot'
                        })}
                      </p>
                      {candidates.map((c) => (
                        <Button
                          key={c.id}
                          type='button'
                          variant={selId === c.id ? 'default' : 'outline'}
                          className='kiosk-touch-min h-auto min-h-14 w-full flex-col py-2'
                          onClick={() => setSelId(c.id)}
                        >
                          <span>
                            {c.time} — {c.code}
                          </span>
                          <span className='text-muted-foreground text-xs font-normal'>
                            {c.service?.name ?? c.serviceId}
                          </span>
                        </Button>
                      ))}
                      <Button
                        className='kiosk-touch-min h-12 w-full sm:h-14'
                        onClick={() => phoneRedeem.mutate()}
                        disabled={!selId || phoneRedeem.isPending}
                      >
                        {phoneRedeem.isPending ? (
                          <Loader2 className='size-6 animate-spin' />
                        ) : (
                          t('get_ticket', { defaultValue: 'Get ticket' })
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div
              className={cn(
                showPhoneTab && tab === 'phone' && 'hidden',
                'min-h-0 shrink-0'
              )}
            >
              <div className='mb-2 flex flex-wrap items-center justify-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  className='kiosk-touch-min'
                  onClick={startCameraScan}
                  disabled={scanBusy || redeemMutation.isPending}
                >
                  {scanBusy
                    ? t('scanning', { defaultValue: 'Scanning…' })
                    : t('use_camera', { defaultValue: 'Use camera' })}
                </Button>
              </div>
              <div className='mb-3 flex justify-center sm:mb-4'>
                <Input
                  value={code}
                  readOnly
                  className='!h-[5.25rem] w-full text-center font-mono !text-4xl font-bold tracking-[0.35em] sm:!h-24 sm:!text-5xl sm:tracking-[0.45em]'
                  placeholder='------'
                />
              </div>
            </div>

            {error ? (
              <div className='text-destructive bg-destructive/10 mb-2 shrink-0 rounded-md px-2 py-2 text-center text-sm leading-snug font-medium sm:mb-3 sm:px-3 sm:text-base'>
                {error}
              </div>
            ) : null}
          </div>

          {(!showPhoneTab || tab === 'code') && (
            <div className='bg-muted/50 shrink-0 border-t px-4 pt-3 pb-4 sm:px-5 sm:pb-5'>
              <div className='mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-3'>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                  <Button
                    key={digit}
                    variant='outline'
                    className='kiosk-touch-min h-[4.5rem] min-h-12 text-3xl font-bold sm:h-[5rem] sm:text-4xl'
                    onClick={() => handleDigitClick(digit.toString())}
                  >
                    {digit}
                  </Button>
                ))}
                <Button
                  variant='outline'
                  className='kiosk-touch-min h-[4.5rem] min-h-12 text-3xl font-bold sm:h-[5rem] sm:text-4xl'
                  onClick={() => setCode('')}
                >
                  C
                </Button>
                <Button
                  variant='outline'
                  className='kiosk-touch-min h-[4.5rem] min-h-12 text-3xl font-bold sm:h-[5rem] sm:text-4xl'
                  onClick={() => handleDigitClick('0')}
                >
                  0
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  className='kiosk-touch-min h-[4.5rem] min-h-12 sm:h-[5rem]'
                  onClick={handleBackspace}
                  aria-label={t('backspace', {
                    defaultValue: 'Delete last digit'
                  })}
                >
                  <Delete className='size-7 sm:size-9' aria-hidden />
                </Button>
              </div>

              <div className='flex gap-2 sm:gap-3'>
                <Button
                  variant='outline'
                  className='kiosk-touch-min h-12 min-h-12 flex-1 text-base sm:h-14 sm:text-lg'
                  onClick={closeModal}
                >
                  {t('cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button
                  className='kiosk-touch-min h-12 min-h-12 flex-1 text-base sm:h-14 sm:text-lg'
                  onClick={handleSubmit}
                  disabled={code.length !== 6 || redeemMutation.isPending}
                >
                  {redeemMutation.isPending ? (
                    <Loader2 className='kiosk-a11y-respect-motion size-6 animate-spin sm:size-7' />
                  ) : (
                    t('submit', { defaultValue: 'Submit' })
                  )}
                </Button>
              </div>
            </div>
          )}

          {showPhoneTab && tab === 'phone' && !lookupToken && (
            <div className='bg-muted/50 border-t px-4 pt-3 pb-4 sm:px-5 sm:pb-5'>
              <Button
                variant='outline'
                className='kiosk-touch-min h-12 w-full sm:h-14'
                onClick={closeModal}
              >
                {t('cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          )}
          {showPhoneTab && tab === 'phone' && lookupToken && (
            <div className='bg-muted/50 border-t px-4 pt-3 pb-4 sm:px-5 sm:pb-5'>
              <Button
                variant='outline'
                className='kiosk-touch-min h-12 w-full sm:h-14'
                onClick={closeModal}
              >
                {t('cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          )}
          {cameraScanOverlay}
        </div>
      </KioskDialogContent>
    </Dialog>
  );
}
