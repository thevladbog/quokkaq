'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LockScreenProps {
  isLocked: boolean;
  onUnlockRequest: () => void;
}

export function LockScreen({ isLocked, onUnlockRequest }: LockScreenProps) {
  const t = useTranslations('kiosk.lock_screen');
  const [clickCount, setClickCount] = useState(0);

  if (!isLocked) return null;

  const handleUnlockClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (newCount >= 5) {
      onUnlockRequest();
      setClickCount(0);
    } else {
      // Reset clicks if not continued quickly
      setTimeout(() => setClickCount(0), 2000);
    }
  };

  return (
    <div className='bg-background/95 fixed inset-0 z-50 flex flex-col items-center justify-center p-4 text-center backdrop-blur-sm'>
      <div
        className='bg-card mb-6 cursor-pointer rounded-full p-8 shadow-lg'
        onClick={handleUnlockClick}
      >
        <Lock className='text-primary h-16 w-16' />
      </div>
      <h1 className='mb-2 text-3xl font-bold'>
        {t('kiosk_locked', { defaultValue: 'Kiosk Locked' })}
      </h1>
      <p className='text-muted-foreground max-w-md'>
        {t('contact_admin', {
          defaultValue:
            'This kiosk is currently locked. Please contact an administrator.'
        })}
      </p>
    </div>
  );
}
