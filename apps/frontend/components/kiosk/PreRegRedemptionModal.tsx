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
      <DialogContent className='overflow-hidden p-0 sm:max-w-[600px]'>
        <div className='p-8 pb-0'>
          <DialogHeader className='mb-6'>
            <DialogTitle className='text-center text-3xl'>
              {t('enter_code', { defaultValue: 'Enter Code' })}
            </DialogTitle>
          </DialogHeader>

          <div className='mb-8 flex justify-center'>
            <Input
              value={code}
              readOnly
              className='!h-32 w-full text-center font-mono !text-8xl font-bold tracking-[0.5em] md:!text-6xl'
              placeholder='------'
            />
          </div>

          {error && (
            <div className='text-destructive bg-destructive/10 mb-6 rounded-lg p-4 text-center text-lg font-medium'>
              {error}
            </div>
          )}
        </div>

        <div className='bg-muted/50 p-8 pt-4'>
          <div className='mb-6 grid grid-cols-3 gap-4'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <Button
                key={digit}
                variant='outline'
                className='h-24 text-4xl font-bold'
                onClick={() => handleDigitClick(digit.toString())}
              >
                {digit}
              </Button>
            ))}
            <Button
              variant='outline'
              className='h-24 text-4xl font-bold'
              onClick={() => setCode('')}
            >
              C
            </Button>
            <Button
              variant='outline'
              className='h-24 text-4xl font-bold'
              onClick={() => handleDigitClick('0')}
            >
              0
            </Button>
            <Button
              variant='outline'
              className='h-24'
              onClick={handleBackspace}
            >
              <Delete className='!size-12' />
            </Button>
          </div>

          <div className='flex gap-4'>
            <Button
              variant='outline'
              className='h-16 flex-1 text-xl'
              onClick={onClose}
            >
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              className='h-16 flex-1 text-xl'
              onClick={handleSubmit}
              disabled={code.length === 0 || redeemMutation.isPending}
            >
              {redeemMutation.isPending ? (
                <Loader2 className='h-8 w-8 animate-spin' />
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
