'use client';

import { AlertTriangle, Clock, X, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SlaAlertPayload } from '@/hooks/use-sla-alerts';

interface SlaAlertBannerProps {
  alerts: SlaAlertPayload[];
  onDismiss: (ticketId: string, alertType?: 'wait' | 'service') => void;
  onDismissAll: () => void;
}

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function SlaAlertRow({
  alert,
  onDismiss
}: {
  alert: SlaAlertPayload;
  onDismiss: (id: string, alertType?: 'wait' | 'service') => void;
}) {
  const t = useTranslations('supervisor.dashboardUi.sla');
  const isBreach = alert.thresholdPct >= 100;
  const alertType = alert.alertType ?? 'wait';
  const isServiceAlert = alertType === 'service';

  const thresholdLabel = isBreach
    ? t('threshold100')
    : alert.thresholdPct >= 80
      ? t('threshold80')
      : t('threshold50');

  return (
    <div className='flex items-center justify-between gap-3 py-1.5'>
      <div className='flex min-w-0 flex-1 items-center gap-2'>
        {isServiceAlert ? (
          <Clock className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
        ) : (
          <AlertTriangle className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
        )}
        <Badge
          variant={isBreach ? 'destructive' : 'outline'}
          className='shrink-0'
        >
          {alert.queueNumber}
        </Badge>
        <span className='truncate text-sm leading-tight font-medium'>
          {alert.serviceName}
        </span>
        <span className='text-muted-foreground shrink-0 text-xs'>
          {formatMinutes(alert.elapsedSec)} /{' '}
          {formatMinutes(alert.maxWaitTimeSec)}
        </span>
        <Badge
          variant={isBreach ? 'destructive' : 'secondary'}
          className='shrink-0 text-xs'
        >
          {thresholdLabel}
        </Badge>
        {isServiceAlert && (
          <Badge variant='outline' className='shrink-0 text-xs'>
            {t('bannerServiceLabel', { defaultValue: 'service' })}
          </Badge>
        )}
      </div>
      <Button
        variant='ghost'
        size='icon'
        className='h-6 w-6 shrink-0'
        onClick={() => onDismiss(alert.ticketId, alertType)}
        aria-label={t('dismiss')}
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}

export function SlaAlertBanner({
  alerts,
  onDismiss,
  onDismissAll
}: SlaAlertBannerProps) {
  const t = useTranslations('supervisor.dashboardUi.sla');

  if (alerts.length === 0) return null;

  const breaches = alerts.filter((a) => a.thresholdPct >= 100);
  const warnings = alerts.filter((a) => a.thresholdPct < 100);

  const waitBreaches = breaches.filter(
    (a) => (a.alertType ?? 'wait') === 'wait'
  );
  const serviceBreaches = breaches.filter((a) => a.alertType === 'service');
  const waitWarnings = warnings.filter(
    (a) => (a.alertType ?? 'wait') === 'wait'
  );
  const serviceWarnings = warnings.filter((a) => a.alertType === 'service');

  return (
    <div
      className='border-destructive/40 bg-destructive/5 rounded-lg border px-4 py-3'
      role='alert'
      aria-live='polite'
    >
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <AlertTriangle className='text-destructive h-4 w-4 shrink-0' />
          {waitBreaches.length > 0 && (
            <span className='text-destructive text-sm font-semibold'>
              {t('bannerBreach', { count: waitBreaches.length })}
            </span>
          )}
          {serviceBreaches.length > 0 && (
            <span className='text-destructive text-sm font-semibold'>
              {t('bannerServiceBreach', { count: serviceBreaches.length })}
            </span>
          )}
          {waitWarnings.length > 0 && (
            <span className='text-sm font-medium text-amber-600 dark:text-amber-400'>
              {t('bannerWarning', { count: waitWarnings.length })}
            </span>
          )}
          {serviceWarnings.length > 0 && (
            <span className='text-sm font-medium text-amber-600 dark:text-amber-400'>
              {t('bannerServiceWarning', { count: serviceWarnings.length })}
            </span>
          )}
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='text-muted-foreground h-7 shrink-0 gap-1 text-xs'
          onClick={onDismissAll}
        >
          <XCircle className='h-3.5 w-3.5' />
          {t('dismissAll')}
        </Button>
      </div>
      <div className='divide-border divide-y'>
        {alerts.map((alert) => (
          <SlaAlertRow
            key={`${alert.alertType ?? 'wait'}-${alert.ticketId}-${alert.thresholdPct}`}
            alert={alert}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}
