'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  Status,
  StatusIndicator,
  StatusLabel,
  type KiboStatusVariant
} from '@/components/kibo-ui/status';

export type KioskRuntimeStatus = 'ok' | 'offline' | 'frozen' | 'loading';

type KioskBuildStatusBarProps = {
  appVersion: string;
  status: KioskRuntimeStatus;
  highContrast: boolean;
};

function kioskToKiboStatus(s: KioskRuntimeStatus): KiboStatusVariant {
  switch (s) {
    case 'ok':
      return 'online';
    case 'offline':
      return 'offline';
    case 'frozen':
      return 'frozen';
    case 'loading':
      return 'loading';
    default:
      return 'online';
  }
}

/**
 * Bottom strip: build / app version and runtime health.
 * Status UI from {@link https://www.kibo-ui.com/components/status Kibo UI Status} (vendored under `components/kibo-ui/status`).
 * Keep z-index below idle bar and attract.
 */
export function KioskBuildStatusBar({
  appVersion,
  status,
  highContrast
}: KioskBuildStatusBarProps) {
  const t = useTranslations('kiosk.status_bar');
  const kibo = kioskToKiboStatus(status);
  const label =
    status === 'ok'
      ? t('badge_ok')
      : status === 'offline'
        ? t('badge_offline')
        : status === 'frozen'
          ? t('badge_frozen')
          : t('badge_loading');

  return (
    <div
      className={cn(
        'pointer-events-none fixed right-0 bottom-0 left-0 z-[25] bg-transparent',
        highContrast ? 'text-zinc-400' : 'text-muted-foreground'
      )}
    >
      <div className='flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] text-[11px] sm:text-xs'>
        <span
          className='min-w-0 truncate'
          title={t('version_label', { v: appVersion })}
        >
          {t('version_label', { v: appVersion })}
        </span>
        <Status
          status={kibo}
          title={label}
          className={cn(
            'pointer-events-auto shrink-0 !gap-1.5 border-0 px-2.5 py-0.5 text-[11px] font-medium sm:text-xs',
            highContrast &&
              kibo === 'online' &&
              'bg-emerald-500/20 text-emerald-200',
            highContrast &&
              kibo === 'offline' &&
              'bg-amber-500/25 text-amber-100',
            highContrast && kibo === 'frozen' && 'bg-rose-500/25 text-rose-100',
            highContrast &&
              kibo === 'loading' &&
              'bg-zinc-500/30 text-zinc-200',
            !highContrast &&
              kibo === 'online' &&
              'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200',
            !highContrast &&
              kibo === 'offline' &&
              'bg-amber-500/20 text-amber-950 dark:text-amber-100',
            !highContrast &&
              kibo === 'frozen' &&
              'bg-rose-500/15 text-rose-950 dark:text-rose-100',
            !highContrast &&
              kibo === 'loading' &&
              'bg-muted text-muted-foreground'
          )}
        >
          <StatusIndicator />
          <StatusLabel
            className={cn(
              'text-xs font-medium',
              highContrast ? 'text-inherit' : 'text-foreground/90',
              'max-w-[min(14rem,55vw)] truncate sm:max-w-[18rem]'
            )}
          >
            {label}
          </StatusLabel>
        </Status>
      </div>
    </div>
  );
}
