'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldLabel } from '@/components/ui/field';
import { TimePicker } from '@/components/ui/time-picker';
import { cn } from '@/lib/utils';

/** Hours 00–23 and minutes 00–59 (leading zeros required). */
const TIME_HH_MM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function splitDateTime(v: string): { date: string; time: string } {
  if (!v.trim()) return { date: '', time: '00:00' };
  const [d, t] = v.split('T');
  const timePart = (t || '00:00').slice(0, 5);
  return {
    date: d || '',
    time: TIME_HH_MM_RE.test(timePart) ? timePart : '00:00'
  };
}

function joinDateTime(date: string, time: string): string {
  if (!date) return '';
  const tm = TIME_HH_MM_RE.test(time) ? time : '00:00';
  return `${date}T${tm}`;
}

export interface DateTimePickerProps {
  /** Local datetime: `YYYY-MM-DDTHH:mm` */
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /**
   * `stacked`: date on first row, time full width below (better next to other columns).
   * `default`: date + time side by side from `sm` up.
   */
  variant?: 'default' | 'stacked';
}

/**
 * Shadcn-style date (popover calendar) + time field. Replaces native `datetime-local`.
 */
export function DateTimePicker({
  value = '',
  onChange,
  disabled,
  className,
  variant = 'default'
}: DateTimePickerProps) {
  const t = useTranslations('common');
  const timeFieldId = React.useId();
  const { date, time } = React.useMemo(() => splitDateTime(value), [value]);
  const stacked = variant === 'stacked';

  const handleDate = (d: string) => {
    onChange?.(joinDateTime(d, time));
  };

  const handleTime = (next: string) => {
    onChange?.(joinDateTime(date, next));
  };

  return (
    <div
      className={cn(
        stacked
          ? 'flex flex-col gap-2'
          : 'flex flex-col gap-2 sm:flex-row sm:items-end',
        className
      )}
    >
      <div className={cn('min-w-0', !stacked && 'flex-1')}>
        <DatePicker
          value={date}
          onChange={handleDate}
          disabled={disabled}
          placeholder={t('pickDate', { defaultValue: 'Select date' })}
        />
      </div>
      <Field
        className={cn(
          'w-full',
          !stacked && 'sm:max-w-[16rem] sm:min-w-[12rem] sm:shrink-0'
        )}
      >
        <FieldLabel
          htmlFor={timeFieldId}
          className='text-muted-foreground text-xs'
        >
          {t('time', { defaultValue: 'Time' })}
        </FieldLabel>
        <TimePicker
          id={timeFieldId}
          value={date ? time : ''}
          onChange={handleTime}
          disabled={disabled || !date}
          step={60}
          className={stacked ? 'h-10 w-full' : 'w-full'}
        />
      </Field>
    </div>
  );
}
