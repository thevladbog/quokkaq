'use client';

import QRCode from 'react-qr-code';
import { useTranslations } from 'next-intl';
import {
  displayEstimateToCallMinutes,
  displayMaxWaitInQueueMinutes
} from '@/lib/queue-eta-display';

type QueueStatus = {
  queueLength: number;
  estimatedWaitMinutes: number;
  maxWaitingInQueueMinutes?: number;
  activeCounters: number;
  servedToday?: number;
  services?: Array<{
    serviceId: string;
    serviceName: string;
    queueLength: number;
    estimatedWaitMinutes: number;
  }>;
};

type Props = {
  queueStatus: QueueStatus | null;
  virtualQueueEnabled: boolean;
  queueUrl: string;
  /** When false, only queue stats (no QR column). */
  showQr?: boolean;
  /** When false, hide stats row (QR only). */
  showStats?: boolean;
};

export function ScreenFooterQrWidget({
  queueStatus,
  virtualQueueEnabled,
  queueUrl,
  showQr = true,
  showStats = true
}: Props) {
  const t = useTranslations('screen');

  if (!showStats && !(showQr && virtualQueueEnabled)) {
    return null;
  }

  return (
    <div className='bg-card/95 flex h-full min-h-0 w-full flex-wrap items-center justify-between gap-4 border-t px-4 py-2 md:px-6'>
      {showStats && queueStatus ? (
        <div className='flex min-w-0 flex-wrap items-center gap-3 text-xs md:text-sm'>
          {queueStatus.services && queueStatus.services.length > 0 ? (
            queueStatus.services.map((svc) => (
              <span
                key={svc.serviceId}
                className='bg-muted/60 flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5'
              >
                <strong className='max-w-[120px] truncate'>
                  {svc.serviceName}
                </strong>
                <span className='text-muted-foreground'>
                  {t('serviceQueue', { count: svc.queueLength })}
                  {displayEstimateToCallMinutes(svc.estimatedWaitMinutes) > 0 &&
                    ` · ~${displayEstimateToCallMinutes(svc.estimatedWaitMinutes)} ${t('minutes')}`}
                </span>
              </span>
            ))
          ) : (
            <>
              <span>
                {t('queueLength')}:{' '}
                <strong className='tabular-nums'>
                  {queueStatus.queueLength}
                </strong>
              </span>
              {displayEstimateToCallMinutes(queueStatus.estimatedWaitMinutes) >
                0 && (
                <span>
                  {t('estimateToCall')}:{' '}
                  <strong className='tabular-nums'>
                    ~
                    {displayEstimateToCallMinutes(
                      queueStatus.estimatedWaitMinutes
                    )}{' '}
                    {t('minutes')}
                  </strong>
                </span>
              )}
              {displayMaxWaitInQueueMinutes(
                queueStatus.maxWaitingInQueueMinutes
              ) > 0 && (
                <span>
                  {t('maxWaitInQueueNow')}:{' '}
                  <strong className='tabular-nums'>
                    {displayMaxWaitInQueueMinutes(
                      queueStatus.maxWaitingInQueueMinutes
                    )}{' '}
                    {t('minutes')}
                  </strong>
                </span>
              )}
              {queueStatus.activeCounters > 0 && (
                <span>
                  {t('activeCounters')}:{' '}
                  <strong>{queueStatus.activeCounters}</strong>
                </span>
              )}
            </>
          )}
        </div>
      ) : (
        <div className='min-w-0 flex-1' />
      )}
      {showQr && virtualQueueEnabled && queueUrl?.trim() ? (
        <div className='flex shrink-0 items-center gap-2'>
          <p className='text-muted-foreground max-w-[100px] text-right text-xs leading-tight'>
            {t('scanToJoinQueue')}
          </p>
          <div className='rounded bg-white p-1'>
            <QRCode value={queueUrl} size={56} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
