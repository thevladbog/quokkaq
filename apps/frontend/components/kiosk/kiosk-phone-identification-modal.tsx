'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KioskDialogContent } from '@/components/kiosk/kiosk-dialog-content';

/** ITU-T E.164 max significant digits (excluding country code nuances). */
const MAX_PHONE_DIGITS = 15;

export interface KioskPhoneIdentificationModalProps {
  isOpen: boolean;
  /** Bump when opening the modal so digit state resets (inner body remounts). */
  sessionKey: number;
  onSkip: () => void;
  onConfirm: (e164StyleInput: string) => void;
  isPending: boolean;
  errorMessage?: string;
  /** Text from the last document OCR; digits can be offered as a one-tap numpad fill. */
  kioskOcrText?: string;
}

function KioskPhoneIdentificationModalBody({
  onSkip,
  onConfirm,
  isPending,
  errorMessage,
  kioskOcrText
}: {
  onSkip: () => void;
  onConfirm: (e164StyleInput: string) => void;
  isPending: boolean;
  errorMessage?: string;
  kioskOcrText?: string;
}) {
  const t = useTranslations('kiosk.phone_identification');
  const tOcr = useTranslations('kiosk.id_ocr');
  const [digits, setDigits] = useState('');

  const ocrDigitRun = (kioskOcrText || '')
    .replace(/\D/g, '')
    .slice(-MAX_PHONE_DIGITS);

  const display = digits.length > 0 ? `+${digits}` : '+';

  const handleDigit = (d: string) => {
    if (digits.length < MAX_PHONE_DIGITS) {
      setDigits((prev) => prev + d);
    }
  };

  const handleBackspace = () => {
    setDigits((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDigits('');
  };

  const handleConfirm = () => {
    if (digits.length < 1 || isPending) {
      return;
    }
    onConfirm(`+${digits}`);
  };

  return (
    <>
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain px-4 pt-4 pb-2 sm:px-5 sm:pt-5'>
        <DialogHeader className='mb-3 shrink-0 space-y-0 sm:mb-4'>
          <DialogTitle className='text-center text-xl leading-tight sm:text-2xl'>
            {t('title', { defaultValue: 'Phone number' })}
          </DialogTitle>
          <p className='text-muted-foreground text-center text-sm sm:text-base'>
            {t('subtitle', {
              defaultValue:
                'Optional identification. Enter your number or skip.'
            })}
          </p>
        </DialogHeader>

        <div className='mb-3 flex shrink-0 justify-center sm:mb-4'>
          {/* Not an <input>: avoids browser selecting “+” on open (Yandex/search popups on touch kiosks). */}
          <div
            dir='ltr'
            tabIndex={-1}
            role='status'
            aria-live='polite'
            aria-atomic='true'
            aria-label={t('phone_aria', { defaultValue: 'Phone number' })}
            className={cn(
              'border-input bg-background text-foreground flex w-full min-w-0 items-center justify-center rounded-md border px-3 font-mono text-3xl font-bold tracking-wide shadow-xs select-none sm:text-4xl',
              '!h-[5.25rem] sm:!h-24'
            )}
          >
            {display}
          </div>
        </div>

        {errorMessage ? (
          <div className='text-destructive bg-destructive/10 mb-2 shrink-0 rounded-md px-2 py-2 text-center text-sm leading-snug font-medium sm:mb-3 sm:px-3 sm:text-base'>
            {errorMessage}
          </div>
        ) : null}

        {ocrDigitRun ? (
          <div className='mb-2 shrink-0 sm:mb-3'>
            <Button
              type='button'
              variant='secondary'
              className='h-12 w-full text-sm font-medium sm:h-14 sm:text-base'
              onClick={() => {
                setDigits(ocrDigitRun);
              }}
              disabled={isPending}
            >
              {tOcr('phone_use_digits', {
                defaultValue: 'Use digits from last scan: {n}',
                n: ocrDigitRun
              })}
            </Button>
          </div>
        ) : null}
      </div>

      <div className='bg-muted/50 shrink-0 border-t px-4 pt-3 pb-4 sm:px-5 sm:pb-5'>
        <div className='mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-3'>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <Button
              key={digit}
              type='button'
              variant='outline'
              className='kiosk-touch-min h-[4.5rem] min-h-12 text-3xl font-bold sm:h-[5rem] sm:text-4xl'
              onClick={() => handleDigit(digit.toString())}
              disabled={isPending}
            >
              {digit}
            </Button>
          ))}
          <Button
            type='button'
            variant='outline'
            className='kiosk-touch-min h-[4.5rem] min-h-12 text-3xl font-bold sm:h-[5rem] sm:text-4xl'
            onClick={handleClear}
            disabled={isPending}
          >
            C
          </Button>
          <Button
            type='button'
            variant='outline'
            className='kiosk-touch-min h-[4.5rem] min-h-12 text-3xl font-bold sm:h-[5rem] sm:text-4xl'
            onClick={() => handleDigit('0')}
            disabled={isPending}
          >
            0
          </Button>
          <Button
            type='button'
            variant='outline'
            className='kiosk-touch-min h-[4.5rem] min-h-12 sm:h-[5rem]'
            onClick={handleBackspace}
            disabled={isPending}
            aria-label={t('backspace', {
              defaultValue: 'Delete last digit'
            })}
          >
            <Delete className='size-7 sm:size-9' aria-hidden />
          </Button>
        </div>

        <div className='flex flex-col gap-2 sm:flex-row sm:gap-3'>
          <Button
            type='button'
            variant='outline'
            className='kiosk-touch-min h-[4.5rem] min-h-12 flex-1 text-base sm:h-[5rem] sm:text-lg'
            onClick={onSkip}
            disabled={isPending}
          >
            {t('skip', { defaultValue: 'Skip' })}
          </Button>
          <Button
            type='button'
            className='kiosk-touch-min h-[4.5rem] min-h-12 flex-1 text-base sm:h-[5rem] sm:text-lg'
            onClick={handleConfirm}
            disabled={digits.length < 1 || isPending}
          >
            {isPending ? (
              <Loader2 className='kiosk-a11y-respect-motion size-6 animate-spin sm:size-7' />
            ) : (
              t('confirm', { defaultValue: 'Continue' })
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

export function KioskPhoneIdentificationModal({
  isOpen,
  sessionKey,
  onSkip,
  onConfirm,
  isPending,
  errorMessage,
  kioskOcrText
}: KioskPhoneIdentificationModalProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onSkip();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <KioskDialogContent
        className='flex max-h-[min(92dvh,720px)] w-[calc(100%-1rem)] max-w-[440px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]'
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <KioskPhoneIdentificationModalBody
          key={sessionKey}
          onSkip={onSkip}
          onConfirm={onConfirm}
          isPending={isPending}
          errorMessage={errorMessage}
          kioskOcrText={kioskOcrText}
        />
      </KioskDialogContent>
    </Dialog>
  );
}
