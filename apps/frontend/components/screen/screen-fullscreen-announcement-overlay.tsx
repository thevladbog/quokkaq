'use client';

import { useTranslations } from 'next-intl';

const styleClass: Record<string, string> = {
  info: 'border-blue-500/30 bg-blue-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  urgent: 'border-destructive/50 bg-destructive/5'
};

type Item = { id: string; text: string; style: string; priority: number };

export function ScreenFullscreenAnnouncementOverlay({
  items
}: {
  items: Item[];
}) {
  const t = useTranslations('screen');
  if (items.length === 0) {
    return null;
  }
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  return (
    <div
      className='bg-background/95 pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-6'
      role='alert'
      aria-live='assertive'
    >
      <div className='max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl border-2 p-6 shadow-2xl'>
        <p className='text-muted-foreground mb-3 text-center text-xs font-semibold uppercase'>
          {t('announcements.fullscreenLabel', { default: 'Notice' })}
        </p>
        {sorted.map((a) => (
          <div
            key={a.id}
            className={`mb-3 rounded-xl border-2 px-4 py-4 text-center text-2xl leading-snug font-semibold last:mb-0 md:text-3xl ${
              styleClass[a.style] ?? styleClass.info
            }`}
          >
            {a.text}
          </div>
        ))}
      </div>
    </div>
  );
}
