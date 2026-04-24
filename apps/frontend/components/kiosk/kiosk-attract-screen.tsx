'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatAppDate, formatAppTime } from '@/lib/format-datetime';
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
  const reduceMotion = useReducedMotion();
  const hasAds = contentSlides.length > 0;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const textMain = highContrast ? 'text-white' : 'text-kiosk-ink';
  const textMuted = highContrast ? 'text-zinc-300' : 'text-kiosk-ink-muted';

  const qLen = eta?.queueLength;
  const qWait = eta?.estimatedWaitMinutes;
  const showMeta =
    showQueueDepth && eta && (qLen != null || qWait != null || qLen === 0);

  const queueMetaNode = showMeta ? (
    <div
      className={cn(
        'w-full max-w-md rounded-2xl px-4 py-2.5 text-center text-sm sm:text-base',
        highContrast
          ? 'border border-white/20 bg-white/5'
          : 'bg-kiosk-border/20',
        hasAds && 'py-1.5 text-sm'
      )}
    >
      {qLen != null && qLen > 0 ? (
        <p className={textMain}>
          {tA('queue_length', { n: qLen, defaultValue: 'In queue: {n}' })}
        </p>
      ) : null}
      {qLen === 0 ? (
        <p className={textMain}>
          {tA('queue_empty', { defaultValue: 'No one in queue' })}
        </p>
      ) : null}
      {qWait != null && qWait > 0 ? (
        <p className={cn('mt-0.5', textMuted)}>
          {tA('wait_minutes', {
            minutes: qWait,
            defaultValue: 'Approx. wait: {minutes} min'
          })}
        </p>
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
                highContrast ? 'text-zinc-400' : 'text-kiosk-ink-muted'
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
