'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type KioskRuntimeStatus = 'ok' | 'offline' | 'frozen' | 'loading';

type KioskBuildStatusBarProps = {
  appVersion: string;
  status: KioskRuntimeStatus;
  highContrast: boolean;
};

const BADGE =
  'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium';

/**
 * Bottom strip: build / app version and runtime health badge. Keep z-index below idle bar and attract.
 */
export function KioskBuildStatusBar({
  appVersion,
  status,
  highContrast
}: KioskBuildStatusBarProps) {
  const t = useTranslations('kiosk.status_bar');

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
        <span
          className={cn(
            BADGE,
            status === 'ok' &&
              (highContrast
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-emerald-500/15 text-emerald-800'),
            status === 'offline' &&
              (highContrast
                ? 'bg-amber-500/25 text-amber-100'
                : 'bg-amber-500/20 text-amber-950'),
            status === 'frozen' &&
              (highContrast
                ? 'bg-rose-500/25 text-rose-100'
                : 'bg-rose-500/15 text-rose-950'),
            status === 'loading' &&
              (highContrast
                ? 'bg-zinc-500/30 text-zinc-200'
                : 'bg-muted text-muted-foreground')
          )}
        >
          {status === 'ok' && t('badge_ok')}
          {status === 'offline' && t('badge_offline')}
          {status === 'frozen' && t('badge_frozen')}
          {status === 'loading' && t('badge_loading')}
        </span>
      </div>
    </div>
  );
}
