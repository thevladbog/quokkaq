'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Delete } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PinCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  correctPin: string;
}

export function PinCodeModal({
  isOpen,
  onClose,
  onSuccess,
  correctPin
}: PinCodeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-[400px]'>
        <DialogHeader>
          <DialogTitle className='text-center'>
            <PinCodeTitle />
          </DialogTitle>
        </DialogHeader>
        {isOpen && (
          <PinCodeForm
            onClose={onClose}
            onSuccess={onSuccess}
            correctPin={correctPin}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PinCodeTitle() {
  const t = useTranslations('kiosk.pin_modal');
  return <>{t('enter_pin')}</>;
}

function normalizeKioskPin(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function PinCodeForm({
  onClose,
  onSuccess,
  correctPin
}: {
  onClose: () => void;
  onSuccess: () => void;
  correctPin: string;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const t = useTranslations('kiosk.pin_modal');
  const expectedPin = normalizeKioskPin(correctPin) || '0000';

  const handleNumberClick = (num: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleSubmit = () => {
    if (normalizeKioskPin(pin) === expectedPin) {
      onSuccess();
      onClose();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className='flex flex-col items-center space-y-4'>
      <div className='mb-4 flex justify-center space-x-2'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-full ${i < pin.length ? 'bg-primary' : 'bg-muted'} ${error ? 'bg-destructive' : ''}`}
          />
        ))}
      </div>

      {error && <p className='text-destructive text-sm'>{t('invalid_pin')}</p>}

      <div className='grid w-full grid-cols-3 gap-2'>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Button
            key={num}
            type='button'
            variant='outline'
            className='h-12 text-lg font-bold'
            onClick={() => handleNumberClick(num.toString())}
          >
            {num}
          </Button>
        ))}
        <div />
        <Button
          type='button'
          variant='outline'
          className='h-12 text-lg font-bold'
          onClick={() => handleNumberClick('0')}
        >
          0
        </Button>
        <Button
          type='button'
          variant='ghost'
          className='h-12'
          onClick={handleDelete}
        >
          <Delete className='h-6 w-6' />
        </Button>
      </div>

      <div className='flex w-full gap-2'>
        <Button
          type='button'
          variant='outline'
          className='kiosk-touch-min min-h-12 flex-1'
          onClick={onClose}
        >
          {t('cancel')}
        </Button>
        <Button
          type='button'
          className='kiosk-touch-min min-h-12 flex-1'
          onClick={handleSubmit}
        >
          {t('submit')}
        </Button>
      </div>
    </div>
  );
}
