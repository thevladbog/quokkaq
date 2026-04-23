'use client';

import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const styleClass: Record<string, string> = {
  info: 'border-blue-500/30 bg-blue-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  urgent: 'border-destructive/50 bg-destructive/5'
};

type Item = { id: string; text: string; style: string; priority: number };

export function ScreenFullscreenAnnouncementOverlay({
  items,
  variant = 'screen'
}: {
  items: Item[];
  /** `embedded` — in-admin preview (not fixed, no assertive live region) */
  variant?: 'screen' | 'embedded';
}) {
  const t = useTranslations('screen');
  const reduceMotion = useReducedMotion();
  if (items.length === 0) {
    return null;
  }
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const isEmbedded = variant === 'embedded';
  return (
    <div
      className={cn(
        'bg-background/95 pointer-events-none flex items-center justify-center p-2',
        isEmbedded
          ? 'relative z-0 min-h-40 w-full rounded-lg border'
          : cn(
              'fixed inset-0 z-[100] p-6',
              reduceMotion && 'motion-reduce:transition-none'
            )
      )}
      role={isEmbedded ? 'region' : 'alert'}
      aria-live={isEmbedded ? 'polite' : 'assertive'}
      aria-label={
        isEmbedded
          ? t('announcements.embeddedPreviewLabel', {
              default: 'Full screen announcement preview'
            })
          : undefined
      }
    >
      <div
        className={cn(
          'w-full max-w-4xl overflow-y-auto rounded-2xl border-2 p-6',
          isEmbedded
            ? 'max-h-32 text-sm shadow-sm'
            : cn(
                'max-h-[85vh]',
                reduceMotion ? 'border-border shadow-sm' : 'shadow-2xl'
              )
        )}
      >
        <p className='text-muted-foreground mb-3 text-center text-xs font-semibold uppercase'>
          {t('announcements.fullscreenLabel', { default: 'Notice' })}
        </p>
        {sorted.map((a) => (
          <div
            key={a.id}
            className={cn(
              'mb-3 rounded-xl border-2 px-3 py-2 text-center text-lg leading-snug font-semibold last:mb-0',
              !isEmbedded && 'px-4 py-4 text-2xl md:text-3xl',
              styleClass[a.style] ?? styleClass.info
            )}
          >
            {a.text}
          </div>
        ))}
      </div>
    </div>
  );
}
