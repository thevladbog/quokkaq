'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatAppDate, formatAppTime } from '@/lib/format-datetime';
import { formatSlaDuration } from '@/lib/format-sla-duration';
import { relativeLuminanceFromCssColor } from '@/lib/kiosk-wcag-contrast';
import {
  ContentPlayer,
  type ContentSlide
} from '@/components/screen/content-player';
import type { UnitETASnapshot } from '@/lib/socket';

export type KioskAttractScreenProps = {
  onDismiss: () => void;
  intlLocale: string;
  currentTime: Date | null;
  logoUrl?: string;
  highContrast: boolean;
  bodyBackground: string;
  showQueueDepth: boolean;
  eta: UnitETASnapshot | null;
  contentSlides: ContentSlide[];
  defaultImageSeconds: number;
};

/**
 * Attract: header (logo + time), center = signage ContentPlayer or queue + CTA,
 * footer = ETA strip + CTA when slides play. Dismiss: full-screen when no ads; CTA only when ads.
 */
export function KioskAttractScreen({
  onDismiss,
  intlLocale,
  currentTime,
  logoUrl,
  highContrast,
  bodyBackground,
  showQueueDepth,
  eta,
  contentSlides,
  defaultImageSeconds
}: KioskAttractScreenProps) {
  const tA = useTranslations('kiosk.attract');
  const tStats = useTranslations('statistics');
  const reduceMotion = useReducedMotion();
  const hasAds = contentSlides.length > 0;

  /** Match kiosk page: on dark `bodyBackground`, kiosk-ink can stay a dark token (e.g. custom theme without data attr). */
  const useLightText = useMemo(() => {
    if (highContrast) {
      return true;
    }
    const lum = relativeLuminanceFromCssColor(bodyBackground);
    return lum != null && lum < 0.45;
  }, [highContrast, bodyBackground]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const textMain = useLightText ? 'text-white' : 'text-kiosk-ink';
  const textMuted = useLightText ? 'text-zinc-200' : 'text-kiosk-ink-muted';

  const qLen = eta?.queueLength;
  const qWait = eta?.estimatedWaitMinutes;
  const showMeta =
    showQueueDepth && eta && (qLen != null || qWait != null || qLen === 0);

  /** API sends fractional “minutes”; convert to whole seconds, then “Xm Ys” via formatSlaDuration. */
  const waitSecondsRounded =
    qWait != null && qWait > 0 ? Math.max(0, Math.round(qWait * 60)) : 0;
  const showWaitCard = waitSecondsRounded > 0;
  const showQueueCountCard = qLen != null && qLen > 0;
  const showEmptyCard = qLen === 0;
  const hasTwoColumnRow =
    (showQueueCountCard && showWaitCard) || (showEmptyCard && showWaitCard);
  const waitAlone = showWaitCard && !showQueueCountCard && !showEmptyCard;

  const badgeClass = cn(
    'flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2.5 text-center sm:px-4 sm:py-3',
    useLightText
      ? 'border border-white/20 bg-white/8'
      : 'border border-kiosk-ink/10 bg-kiosk-border/25',
    hasAds && 'py-2',
    'min-w-28 sm:min-w-36'
  );

  const waitFormatted = showWaitCard
    ? formatSlaDuration(waitSecondsRounded, tStats)
    : '';

  const queueMetaNode = showMeta ? (
    <div
      className={cn(
        'flex w-full max-w-2xl flex-wrap items-stretch justify-center gap-2 sm:max-w-3xl sm:gap-3',
        hasTwoColumnRow && 'sm:flex-nowrap'
      )}
    >
      {showEmptyCard ? (
        <div
          className={cn(
            badgeClass,
            hasTwoColumnRow && 'min-w-0',
            !showWaitCard && 'w-full max-w-sm'
          )}
        >
          <p className={cn('text-sm sm:text-base', textMain)} role='status'>
            {tA('queue_empty', { defaultValue: 'No one in queue' })}
          </p>
        </div>
      ) : null}
      {showQueueCountCard && qLen != null ? (
        <div
          className={cn(
            badgeClass,
            hasTwoColumnRow && 'min-w-0',
            !showWaitCard && 'w-full max-w-sm'
          )}
          role='status'
          aria-label={tA('queue_length', {
            n: qLen,
            defaultValue: 'In queue: {n}'
          })}
        >
          <span className={cn('text-xs font-medium sm:text-sm', textMuted)}>
            {tA('queue_badge_label', { defaultValue: 'In queue' })}
          </span>
          <span
            className={cn(
              'text-2xl font-bold tabular-nums sm:text-3xl',
              textMain
            )}
          >
            {qLen}
          </span>
        </div>
      ) : null}
      {showWaitCard ? (
        <div
          className={cn(
            badgeClass,
            waitAlone && 'w-full max-w-sm',
            hasTwoColumnRow && 'min-w-0'
          )}
          role='status'
          aria-label={tA('wait_badge_aria', {
            time: waitFormatted,
            defaultValue: 'Approx. wait: {time}'
          })}
        >
          <span className={cn('text-xs font-medium sm:text-sm', textMuted)}>
            {tA('wait_badge_label', { defaultValue: 'Approx. wait' })}
          </span>
          <span
            className={cn(
              'text-2xl font-bold tabular-nums sm:text-3xl',
              textMain
            )}
          >
            {waitFormatted}
          </span>
        </div>
      ) : null}
    </div>
  ) : null;

  const cta = (
    <motion.div
      animate={
        reduceMotion
          ? undefined
          : { scale: [1, 1.02, 1], opacity: [1, 0.97, 1] }
      }
      transition={
        reduceMotion
          ? undefined
          : { duration: 2, repeat: Infinity, ease: 'easeInOut' }
      }
    >
      <Button
        type='button'
        size='lg'
        className='kiosk-touch-min pointer-events-auto min-h-14 w-full min-w-[min(100%,18rem)] rounded-full px-10 text-lg font-bold shadow-lg sm:min-h-16 sm:text-xl'
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        {tA('cta', { defaultValue: 'Tap to start' })}
      </Button>
    </motion.div>
  );

  return (
    <div
      className='fixed inset-0 z-[45] flex min-h-0 w-full flex-col overflow-hidden'
      style={{ backgroundColor: bodyBackground }}
    >
      {!hasAds ? (
        <button
          type='button'
          className='absolute inset-0 z-0 cursor-default'
          aria-label={tA('dismiss_aria', {
            defaultValue: 'Continue to services'
          })}
          onClick={onDismiss}
        />
      ) : null}

      <header
        className={cn(
          'relative z-20 flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6',
          'pointer-events-auto'
        )}
      >
        <div className='max-w-[55%] min-w-0 sm:max-w-none'>
          {logoUrl ? (
            <div
              className={cn(
                'inline-flex h-12 w-auto sm:h-14',
                highContrast && 'rounded-lg p-1'
              )}
              style={
                highContrast
                  ? { backgroundColor: 'rgba(0,0,0,0.2)' }
                  : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=''
                className='h-full w-auto object-contain'
              />
            </div>
          ) : null}
        </div>
        {currentTime ? (
          <div
            className={cn(
              'shrink-0 text-right',
              textMain,
              'text-sm sm:text-base'
            )}
          >
            <div className='font-bold tracking-tight sm:text-xl md:text-2xl'>
              {formatAppTime(currentTime, intlLocale)}
            </div>
            <div
              className={cn(
                'text-xs',
                useLightText ? 'text-zinc-300' : 'text-kiosk-ink-muted'
              )}
            >
              {formatAppDate(currentTime, intlLocale, 'full', '')}
            </div>
          </div>
        ) : null}
      </header>

      {hasAds ? (
        <>
          <div className='relative z-10 mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-2 pb-2 sm:px-4'>
            <div className='min-h-0 flex-1 overflow-hidden rounded-lg'>
              <ContentPlayer
                slides={contentSlides}
                defaultImageSeconds={defaultImageSeconds}
              />
            </div>
          </div>
          <footer className='relative z-20 flex max-h-[45vh] shrink-0 flex-col items-center gap-2 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6'>
            {queueMetaNode}
            <div className='w-full max-w-md'>{cta}</div>
          </footer>
        </>
      ) : (
        <div className='relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-5 px-4 sm:gap-6'>
          {queueMetaNode}
          <div className='relative w-full max-w-md'>{cta}</div>
        </div>
      )}
    </div>
  );
}
