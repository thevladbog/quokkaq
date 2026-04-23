'use client';

import QRCode from 'react-qr-code';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type JoinQueueQrAlign = 'left' | 'center' | 'right';

export function parseJoinQueueQrAlign(raw: unknown): JoinQueueQrAlign {
  if (raw === 'left' || raw === 'right' || raw === 'center') {
    return raw;
  }
  return 'center';
}

type Props = {
  virtualQueueEnabled: boolean;
  queueUrl: string;
  align?: JoinQueueQrAlign;
};

export function ScreenJoinQueueQrWidget({
  virtualQueueEnabled,
  queueUrl,
  align = 'center'
}: Props) {
  const t = useTranslations('screen');

  const justify =
    align === 'left'
      ? 'justify-start'
      : align === 'right'
        ? 'justify-end'
        : 'justify-center';

  if (!virtualQueueEnabled) {
    return (
      <div
        className={cn(
          'text-muted-foreground flex h-full min-h-0 w-full items-center px-2 text-center text-xs',
          justify
        )}
      >
        {t('joinQueueQrDisabled', {
          default:
            'Virtual queue is off — enable it in unit settings to show the QR.'
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full items-center gap-2 px-2 py-1',
        justify
      )}
    >
      <div className='flex max-w-full items-center gap-2'>
        <p className='text-muted-foreground max-w-[120px] text-xs leading-tight'>
          {t('scanToJoinQueue')}
        </p>
        <div className='rounded bg-white p-1'>
          <QRCode value={queueUrl} size={64} />
        </div>
      </div>
    </div>
  );
}
