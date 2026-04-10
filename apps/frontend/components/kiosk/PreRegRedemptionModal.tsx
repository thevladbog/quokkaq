'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Delete } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { preRegistrationsApi, Ticket } from '@/lib/api';

interface PreRegRedemptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  onSuccess: (ticket: Ticket) => void;
}

export function PreRegRedemptionModal({
  isOpen,
  onClose,
  unitId,
  onSuccess
}: PreRegRedemptionModalProps) {
  const t = useTranslations('kiosk.pre_registration');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const redeemMutation = useMutation({
    mutationFn: (code: string) => preRegistrationsApi.redeem(unitId, code),
    onSuccess: (data) => {
      if (data.success && data.ticket) {
        setCode('');
        setError('');
        onSuccess(data.ticket);
        onClose();
      } else {
        // Handle "soft" errors
        const errorMessage = data.message || '';
        if (errorMessage.includes('pre-registration not found')) {
          setError(t('errors.not_found'));
        } else if (errorMessage.includes('too early')) {
          setError(t('errors.too_early'));
        } else if (errorMessage.includes('too late')) {
          setError(t('errors.too_late'));
        } else {
          setError(
            t('invalid_code', {
              defaultValue: 'Invalid code. Please try again.'
            })
          );
        }
      }
    },
    onError: () => {
      // Handle network errors or unexpected 500s
      setError(
        t('invalid_code', { defaultValue: 'Invalid code. Please try again.' })
      );
    }
  });

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
    if (code.length > 0) {
      redeemMutation.mutate(code);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[min(92dvh,720px)] w-[calc(100%-1rem)] max-w-[440px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[440px]'>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2 sm:px-5 sm:pt-5'>
          <DialogHeader className='mb-3 space-y-0 sm:mb-4'>
            <DialogTitle className='text-center text-xl leading-tight sm:text-2xl'>
              {t('enter_code', { defaultValue: 'Enter Code' })}
            </DialogTitle>
          </DialogHeader>

          <div className='mb-3 flex justify-center sm:mb-4'>
            <Input
              value={code}
              readOnly
              className='!h-[5.25rem] w-full text-center font-mono !text-4xl font-bold tracking-[0.35em] sm:!h-24 sm:!text-5xl sm:tracking-[0.45em]'
              placeholder='------'
            />
          </div>

          {error ? (
            <div className='text-destructive bg-destructive/10 mb-2 rounded-md px-2 py-2 text-center text-sm leading-snug font-medium sm:mb-3 sm:px-3 sm:text-base'>
              {error}
            </div>
          ) : null}
        </div>

        <div className='bg-muted/50 shrink-0 border-t px-4 pt-3 pb-4 sm:px-5 sm:pb-5'>
          <div className='mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-2.5'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <Button
                key={digit}
                variant='outline'
                className='h-[3.25rem] text-2xl font-bold sm:h-16 sm:text-3xl'
                onClick={() => handleDigitClick(digit.toString())}
              >
                {digit}
              </Button>
            ))}
            <Button
              variant='outline'
              className='h-[3.25rem] text-2xl font-bold sm:h-16 sm:text-3xl'
              onClick={() => setCode('')}
            >
              C
            </Button>
            <Button
              variant='outline'
              className='h-[3.25rem] text-2xl font-bold sm:h-16 sm:text-3xl'
              onClick={() => handleDigitClick('0')}
            >
              0
            </Button>
            <Button
              variant='outline'
              className='h-[3.25rem] sm:h-16'
              onClick={handleBackspace}
            >
              <Delete className='size-7 sm:size-9' />
            </Button>
          </div>

          <div className='flex gap-2 sm:gap-3'>
            <Button
              variant='outline'
              className='h-12 flex-1 text-base sm:h-14 sm:text-lg'
              onClick={onClose}
            >
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              className='h-12 flex-1 text-base sm:h-14 sm:text-lg'
              onClick={handleSubmit}
              disabled={code.length === 0 || redeemMutation.isPending}
            >
              {redeemMutation.isPending ? (
                <Loader2 className='size-6 animate-spin sm:size-7' />
              ) : (
                t('submit', { defaultValue: 'Submit' })
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
