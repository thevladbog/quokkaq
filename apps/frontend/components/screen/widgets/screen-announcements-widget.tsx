'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type Ann = {
  id: string;
  text: string;
  style: string;
  priority: number;
};

const styleClass: Record<string, string> = {
  info: 'border-blue-500/30 bg-blue-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  urgent: 'border-destructive/50 bg-destructive/5'
};

export function ScreenAnnouncementsWidget({
  items,
  strip = false
}: {
  items: Ann[];
  strip?: boolean;
}) {
  const t = useTranslations('screen');
  if (items.length === 0) {
    return null;
  }
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  return (
    <div
      className={cn(
        'flex flex-col gap-2 overflow-y-auto rounded-xl border',
        strip ? 'max-h-24 w-[8.5rem] min-w-0 p-2' : 'max-h-48 w-full p-3'
      )}
    >
      <div
        className={cn(
          'text-muted-foreground font-semibold uppercase',
          strip ? 'text-[8px]' : 'text-xs'
        )}
      >
        {t('announcements.title', { default: 'Announcements' })}
      </div>
      {sorted.map((a) => (
        <div
          key={a.id}
          className={cn(
            'rounded-lg border text-left leading-snug',
            strip ? 'line-clamp-3 px-2 py-1 text-[10px]' : 'px-3 py-2 text-sm',
            styleClass[a.style] ?? styleClass.info
          )}
        >
          {a.text}
        </div>
      ))}
    </div>
  );
}
