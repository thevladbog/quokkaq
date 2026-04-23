'use client';

import { Printer, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import type { KioskPrinterAlertPayload } from '@/lib/socket';

type Props = {
  alerts: KioskPrinterAlertPayload[];
  onDismiss: (p: KioskPrinterAlertPayload) => void;
  onDismissAll: () => void;
};

function alertKey(p: KioskPrinterAlertPayload): string {
  return `${p.at}::${p.kind}::${p.message}`;
}

export function KioskPrinterAlertBanner({
  alerts,
  onDismiss,
  onDismissAll
}: Props) {
  const t = useTranslations('supervisor.dashboardUi.kiosk_printer');
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div
      className='relative mb-4 w-full max-w-7xl rounded-2xl border-2 border-dotted border-amber-500/40 bg-amber-50/90 px-3 py-2.5 sm:px-4 dark:border-amber-500/30 dark:bg-amber-950/30'
      role='alert'
    >
      <div className='mb-2 flex items-center justify-between gap-2 border-b border-amber-200/50 pb-2 dark:border-amber-800/40'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <Printer
            className='h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-500'
            strokeWidth={2.5}
            aria-hidden
          />
          <h3 className='min-w-0 text-sm font-semibold tracking-tight'>
            {t('title')}
          </h3>
        </div>
        <div className='flex shrink-0 items-center gap-0.5'>
          <Button
            variant='ghost'
            type='button'
            size='sm'
            className='h-6 px-1.5 text-xs'
            onClick={onDismissAll}
            aria-label={t('dismissAll')}
            title={t('dismissAll')}
          >
            {t('dismissAllShort')}
            <XCircle className='ml-0.5 h-3 w-3' />
          </Button>
        </div>
      </div>
      <ul className='space-y-1.5 text-sm leading-snug text-amber-900 dark:text-amber-100/95'>
        {alerts.map((a) => (
          <li
            key={alertKey(a)}
            className='flex items-start justify-between gap-2 border-b border-dotted border-amber-200/60 pb-1.5 last:border-0 last:pb-0 dark:border-amber-800/30'
          >
            <div className='min-w-0 flex-1'>
              <p className='text-xs font-bold uppercase'>
                {a.kind.replace(/_/g, ' ')}
              </p>
              {a.message ? (
                <p className='text-foreground/80 mt-0.5'>{a.message}</p>
              ) : null}
            </div>
            <Button
              variant='ghost'
              type='button'
              size='icon'
              className='h-6 w-6 shrink-0'
              onClick={() => onDismiss(a)}
              aria-label={t('dismissOne')}
            >
              <X className='h-3.5 w-3.5' />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
