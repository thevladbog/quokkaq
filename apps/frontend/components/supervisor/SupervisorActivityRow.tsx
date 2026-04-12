'use client';

import type { ShiftActivityItem } from '@/lib/api';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import {
  getSupervisorActivityPresentation,
  type ActivityTranslate
} from '@/components/supervisor/supervisor-activity-presenter';
import { cn } from '@/lib/utils';

type Props = {
  item: ShiftActivityItem;
  t: ActivityTranslate;
  /** date-fns locale for absolute timestamp */
  dateLocale: Locale;
  /** "PPp" / "PPpp" — journal uses longer format */
  timeFormat?: string;
  className?: string;
};

export function SupervisorActivityRow({
  item,
  t,
  dateLocale,
  timeFormat = 'PPpp',
  className
}: Props) {
  const {
    icon: Icon,
    line,
    iconClassName
  } = getSupervisorActivityPresentation(item, t);
  const createdRaw =
    typeof item.createdAt === 'string' ? item.createdAt.trim() : '';
  let when: string;
  if (!createdRaw) {
    when = t('activityUnknownTimestamp');
  } else {
    const ts = Date.parse(createdRaw);
    if (Number.isNaN(ts)) {
      when = t('activityUnknownTimestamp');
    } else {
      const d = new Date(ts);
      when = Number.isNaN(d.getTime())
        ? t('activityUnknownTimestamp')
        : format(d, timeFormat, { locale: dateLocale });
    }
  }
  const actorLine =
    item.actorName && item.actorName.trim()
      ? t('activityActor', { name: item.actorName.trim() })
      : item.userId
        ? t('activityActorUserId', { id: item.userId })
        : t('activityActorUnknown');

  return (
    <li className={cn('flex gap-3 p-3 text-sm', className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClassName)} />
      <div className='min-w-0 flex-1'>
        <p className='text-foreground'>{line}</p>
        <p className='text-muted-foreground mt-1 text-xs'>{actorLine}</p>
        <p className='text-muted-foreground mt-0.5 font-mono text-[11px] tracking-tight'>
          {when}
        </p>
      </div>
    </li>
  );
}
