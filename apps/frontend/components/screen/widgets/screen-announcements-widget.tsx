'use client';

import { useTranslations } from 'next-intl';

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

export function ScreenAnnouncementsWidget({ items }: { items: Ann[] }) {
  const t = useTranslations('screen');
  if (items.length === 0) {
    return null;
  }
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  return (
    <div className='flex max-h-48 flex-col gap-2 overflow-y-auto rounded-xl border p-3'>
      <div className='text-muted-foreground text-xs font-semibold uppercase'>
        {t('announcements.title', { default: 'Announcements' })}
      </div>
      {sorted.map((a) => (
        <div
          key={a.id}
          className={`rounded-lg border px-3 py-2 text-left text-sm leading-snug ${
            styleClass[a.style] ?? styleClass.info
          }`}
        >
          {a.text}
        </div>
      ))}
    </div>
  );
}
