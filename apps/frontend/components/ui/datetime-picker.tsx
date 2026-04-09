'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function splitDateTime(v: string): { date: string; time: string } {
  if (!v.trim()) return { date: '', time: '00:00' };
  const [d, t] = v.split('T');
  const timePart = (t || '00:00').slice(0, 5);
  return { date: d || '', time: /^\d{2}:\d{2}$/.test(timePart) ? timePart : '00:00' };
}

function joinDateTime(date: string, time: string): string {
  if (!date) return '';
  const tm = /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
  return `${date}T${tm}`;
}

export interface DateTimePickerProps {
  /** Local datetime: `YYYY-MM-DDTHH:mm` */
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Shadcn-style date (popover calendar) + time field. Replaces native `datetime-local`.
 */
export function DateTimePicker({
  value = '',
  onChange,
  disabled,
  className
}: DateTimePickerProps) {
  const t = useTranslations('common');
  const { date, time } = React.useMemo(() => splitDateTime(value), [value]);

  const handleDate = (d: string) => {
    onChange?.(joinDateTime(d, time));
  };

  const handleTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(joinDateTime(date, e.target.value));
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-end',
        className
      )}
    >
      <div className='min-w-0 flex-1'>
        <DatePicker
          value={date}
          onChange={handleDate}
          disabled={disabled}
          placeholder={t('pickDate', { defaultValue: 'Select date' })}
        />
      </div>
      <div className='flex w-full flex-col gap-1.5 sm:w-[9rem]'>
        <Label className='text-muted-foreground text-xs'>
          {t('time', { defaultValue: 'Time' })}
        </Label>
        <Input
          type='time'
          step={60}
          value={date ? time : ''}
          disabled={disabled || !date}
          onChange={handleTime}
        />
      </div>
    </div>
  );
}
