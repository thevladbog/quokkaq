'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  getOverlappingScheduleIds,
  type OverlapCheckRow
} from '@/lib/signage-schedule-overlap';
import { scheduleInCalendarForTodayYmd } from '@/lib/signage-date';

const DAY_INDEX = [1, 2, 3, 4, 5, 6, 7] as const;

type ScheduleRow = {
  id: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
  priority?: number;
  playlistId?: string;
  playlistName?: string;
  /** YYYY-MM-DD, optional (same semantics as API) */
  validFrom?: string;
  validTo?: string;
};

function parseTimeToMin(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) {
    return null;
  }
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function parseDays(set: string): Set<number> {
  const out = new Set<number>();
  for (const p of set.split(/[\s,]+/)) {
    if (!p) {
      continue;
    }
    const n = parseInt(p, 10);
    if (n >= 1 && n <= 7) {
      out.add(n);
    }
  }
  return out;
}

/**
 * 7 columns (Mon..Sun) × 24h strip. Bars show schedule windows; conflicts when two bars overlap the same day are visible.
 */
export function ScheduleTimeline({
  schedules,
  todayYmd
}: {
  schedules: ScheduleRow[];
  /** Civil YYYY-MM-DD in the unit’s IANA timezone */
  todayYmd: string;
}) {
  const t = useTranslations('admin.signage');

  const byDay = useMemo(() => {
    const m = new Map<number, ScheduleRow[]>();
    for (const d of DAY_INDEX) {
      m.set(d, []);
    }
    for (const s of schedules) {
      const days = parseDays(s.daysOfWeek);
      for (const d of days) {
        const list = m.get(d);
        if (list) {
          list.push(s);
        }
      }
    }
    return m;
  }, [schedules]);

  const overlapIds = useMemo(
    () => getOverlappingScheduleIds(schedules as OverlapCheckRow),
    [schedules]
  );
  const hasConflicts = overlapIds.size > 0;
  const calHint =
    schedules.some(
      (s) =>
        (s.validFrom || s.validTo) &&
        !scheduleInCalendarForTodayYmd(s.validFrom, s.validTo, todayYmd)
    ) && todayYmd;

  return (
    <div className='space-y-2'>
      <h3 className='text-sm font-medium'>
        {t('scheduleTimeline', { default: 'Weekly view' })}
      </h3>
      {calHint ? (
        <p className='text-xs text-amber-700 dark:text-amber-400' role='status'>
          {t('scheduleCalendarInactive', {
            default:
              'Amber: schedule has date limits and is outside today’s calendar range (unit timezone).'
          })}
        </p>
      ) : null}
      {hasConflicts ? (
        <p className='text-destructive text-xs' role='status'>
          {t('scheduleConflictLegend', {
            default: 'Red: overlapping time on the same day.'
          })}
        </p>
      ) : null}
      <div className='grid max-w-4xl grid-cols-7 gap-0.5 text-center'>
        {DAY_INDEX.map((d) => {
          const k =
            d === 1
              ? 'dayM'
              : d === 2
                ? 'dayT'
                : d === 3
                  ? 'dayW'
                  : d === 4
                    ? 'dayTh'
                    : d === 5
                      ? 'dayF'
                      : d === 6
                        ? 'dayS'
                        : 'daySn';
          return (
            <div key={d} className='text-muted-foreground text-xs'>
              {t(k)}
            </div>
          );
        })}
        {DAY_INDEX.map((d) => {
          const nBlocks = (byDay.get(d) ?? []).length;
          return (
            <div
              key={`col-${d}`}
              className='bg-muted/30 relative h-20 overflow-hidden rounded border'
            >
              {nBlocks === 0 ? (
                <span className='text-muted-foreground absolute inset-0 flex items-center justify-center text-xs'>
                  —
                </span>
              ) : (
                (byDay.get(d) ?? []).map((s) => {
                  const a = parseTimeToMin(s.startTime) ?? 0;
                  const b = parseTimeToMin(s.endTime) ?? 24 * 60;
                  const w = b > a ? b - a : 0;
                  const left = (a / (24 * 60)) * 100;
                  const width = Math.max(0.5, (w / (24 * 60)) * 100);
                  const conflict = overlapIds.has(s.id);
                  const outCal =
                    (s.validFrom || s.validTo) &&
                    !scheduleInCalendarForTodayYmd(
                      s.validFrom,
                      s.validTo,
                      todayYmd
                    );
                  return (
                    <div
                      key={s.id + s.startTime + d}
                      className={
                        outCal
                          ? 'absolute h-1/2 min-h-[1.5rem] rounded border border-dashed border-amber-500/40 bg-amber-500/10 ring-amber-500/50'
                          : conflict
                            ? 'ring-destructive/60 border-destructive/50 bg-destructive/20 absolute h-1/2 min-h-[1.5rem] rounded border ring-2'
                            : 'bg-primary/30 border-primary/40 absolute h-1/2 min-h-[1.5rem] rounded border'
                      }
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        top: '0.4rem',
                        zIndex: (s.priority ?? 0) + 1
                      }}
                      title={[
                        s.playlistName,
                        s.id,
                        `${s.startTime}–${s.endTime}`,
                        `P${s.priority ?? 0}`,
                        outCal
                          ? t('scheduleCalendarOutTitle', {
                              default: 'Outside calendar'
                            })
                          : conflict
                            ? t('scheduleConflictBarTitle', {
                                default: 'Overlap'
                              })
                            : ''
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
