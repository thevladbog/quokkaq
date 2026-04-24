'use client';

import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Delete, Smartphone, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
  autoRedeemFromDeeplink
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
  const [scanBusy, setScanBusy] = useState(false);
  const scanStopRef = useRef<() => void>(() => {});

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
  const autoRedeemCode = (initialCode || '').replace(/\D/g, '').slice(0, 6);
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

  const scanActive = isOpen && tab === 'code' && !redeemMutation.isPending;
  useKioskBarcodeWedge(scanActive, applyScanned);
  useKioskSerialScannerStream(scanActive, applyScanned);

  const startCameraScan = async () => {
    // BarcodeDetector is Chromium-only; not in all TypeScript DOM libs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD =
      typeof window !== 'undefined'
        ? (window as any).BarcodeDetector
        : undefined;
    if (!BD) {
      setError(
        t('scan_no_api', { defaultValue: 'Camera scan is not available here.' })
      );
      return;
    }
    setScanBusy(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.playsInline = true;
        await v.play();
      }
      const det = new BD({ formats: ['qr_code', 'code_128', 'code_39'] });
      const tick = async () => {
        if (!v || !v.videoWidth) {
          return;
        }
        const codes = await det.detect(v);
        if (codes.length) {
          const r = codes[0]?.rawValue;
          if (r) {
            applyScanned(r);
            stopCamera();
          }
        }
      };
      const id = window.setInterval(tick, 500);
      const stopCamera = () => {
        clearInterval(id);
        stream.getTracks().forEach((x) => x.stop());
        if (v) {
          v.srcObject = null;
        }
        setScanBusy(false);
      };
      scanStopRef.current = stopCamera;
    } catch {
      setError(t('scan_no_camera', { defaultValue: 'No camera available.' }));
      setScanBusy(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent
        className='flex max-h-[min(92dvh,720px)] w-[calc(100%-1rem)] max-w-[480px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px]'
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2 sm:px-5 sm:pt-5'>
          <DialogHeader className='mb-3 space-y-0 sm:mb-4'>
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
            <div className='w-full'>
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
                  tab === 'phone' ? 'min-h-0 space-y-3 pt-0' : 'hidden'
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
              'min-h-0'
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
            <video
              ref={videoRef}
              className={cn(
                'mx-auto max-h-40 w-full max-w-sm rounded border',
                scanBusy ? 'block' : 'hidden'
              )}
              playsInline
              muted
            />

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
            <div className='text-destructive bg-destructive/10 mb-2 rounded-md px-2 py-2 text-center text-sm leading-snug font-medium sm:mb-3 sm:px-3 sm:text-base'>
              {error}
            </div>
          ) : null}
        </div>

        {(!showPhoneTab || tab === 'code') && (
          <div className='bg-muted/50 shrink-0 border-t px-4 pt-3 pb-4 sm:px-5 sm:pb-5'>
            <div className='mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-2.5'>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <Button
                  key={digit}
                  variant='outline'
                  className='kiosk-touch-min h-[3.25rem] min-h-12 text-2xl font-bold sm:h-16 sm:text-3xl'
                  onClick={() => handleDigitClick(digit.toString())}
                >
                  {digit}
                </Button>
              ))}
              <Button
                variant='outline'
                className='kiosk-touch-min h-[3.25rem] min-h-12 text-2xl font-bold sm:h-16 sm:text-3xl'
                onClick={() => setCode('')}
              >
                C
              </Button>
              <Button
                variant='outline'
                className='kiosk-touch-min h-[3.25rem] min-h-12 text-2xl font-bold sm:h-16 sm:text-3xl'
                onClick={() => handleDigitClick('0')}
              >
                0
              </Button>
              <Button
                type='button'
                variant='outline'
                className='kiosk-touch-min h-[3.25rem] min-h-12 sm:h-16'
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
      </DialogContent>
    </Dialog>
  );
}
