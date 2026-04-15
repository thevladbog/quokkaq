'use client';

import * as React from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { useLocale } from 'next-intl';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';

function parseYmdLocal(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = parseISO(s);
  return isValid(d) ? d : undefined;
}

function toYmd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export type DatePickerSingleOrRangeLabels = {
  openCalendar: string;
  /** Shown after the start date when the range end is not chosen yet. */
  rangeAwaitingEnd?: string;
};

export interface DatePickerSingleOrRangeProps {
  from: string;
  /** End of range; omit or empty while the user has only chosen the start day (two-click range). */
  to?: string;
  onRangeChange: (from: string, to: string | undefined) => void;
  labels: DatePickerSingleOrRangeLabels;
  className?: string;
  disabled?: boolean;
}

/** Range calendar: one click starts the range; second click completes it (same day = single-day range). */
export function DatePickerSingleOrRange({
  from,
  to,
  onRangeChange,
  labels,
  className,
  disabled
}: DatePickerSingleOrRangeProps) {
  const appLocale = useLocale();
  const dateLocale = appLocale.toLowerCase().startsWith('ru') ? ru : enUS;

  const rangeSelected: DateRange | undefined = React.useMemo(() => {
    const a = parseYmdLocal(from);
    if (!a) return undefined;
    const endYmd = (to && to.trim()) || '';
    if (!endYmd) {
      return { from: a, to: undefined };
    }
    const b = parseYmdLocal(endYmd);
    if (!b) return undefined;
    return { from: a, to: b };
  }, [from, to]);

  const summary = React.useMemo(() => {
    const a = parseYmdLocal(from);
    if (!a) return labels.openCalendar;
    const endYmd = (to && to.trim()) || '';
    if (!endYmd) {
      const tail =
        labels.rangeAwaitingEnd && labels.rangeAwaitingEnd.trim()
          ? labels.rangeAwaitingEnd
          : '…';
      return `${format(a, 'PPP', { locale: dateLocale })} — ${tail}`;
    }
    const b = parseYmdLocal(endYmd);
    if (!b) return labels.openCalendar;
    if (from === endYmd) {
      return format(a, 'PPP', { locale: dateLocale });
    }
    return `${format(a, 'PPP', { locale: dateLocale })} — ${format(b, 'PPP', { locale: dateLocale })}`;
  }, [from, to, dateLocale, labels.openCalendar, labels.rangeAwaitingEnd]);

  const handleRangeSelect = (r: DateRange | undefined) => {
    if (!r?.from) return;
    const start = toYmd(r.from);
    const end = r.to ? toYmd(r.to) : undefined;
    onRangeChange(start, end);
  };

  return (
    <div className={cn(className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className={cn(
              'min-w-[240px] justify-start text-left font-normal',
              summary === labels.openCalendar && 'text-muted-foreground'
            )}
            disabled={disabled}
            aria-label={labels.openCalendar}
          >
            <CalendarIcon className='mr-2 h-4 w-4 shrink-0' />
            <span className='truncate'>{summary}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-auto p-0' align='start'>
          <Calendar
            mode='range'
            numberOfMonths={2}
            defaultMonth={rangeSelected?.from ?? new Date()}
            selected={rangeSelected}
            onSelect={handleRangeSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
