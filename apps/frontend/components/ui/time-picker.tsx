'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * The native `type="time"` may yield seconds when `step` is 1; we normalize to `HH:MM` for the API.
 */
function normalizeToHHmm(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return '';
  }
  const p = t.split(':');
  if (p.length >= 2) {
    const h = p[0].padStart(2, '0').slice(0, 2);
    const m = p[1].padStart(2, '0').slice(0, 2);
    return `${h}:${m}`;
  }
  return t.slice(0, 5);
}

export interface TimePickerProps extends Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange'
> {
  /** `HH:mm` 24h, or empty if disabled without a value */
  value: string;
  onChange: (value: string) => void;
  /** Renders when `disabled` and not a valid time */
  emptyLabel?: string;
  /**
   * In seconds. Default `1` (as on shadcn). Use `60` for one-minute steps (e.g. schedules). `onChange` is still `HH:mm`.
   */
  step?: number;
}

const SHADCN_TIME_CLASS =
  'appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none';

/**
 * Native time field styled like the shadcn time picker (no clock icon, hidden webkit indicator).
 * Values in parent state are always `HH:mm`.
 */
export function TimePicker({
  value,
  onChange,
  disabled,
  className,
  id,
  emptyLabel = '—',
  step = 1,
  ...inputProps
}: TimePickerProps) {
  const hasValue = Boolean(value && TIME_RE.test(value));
  if (disabled && !hasValue) {
    return (
      <div
        className={cn(
          'border-input bg-background text-muted-foreground flex h-9 w-full min-w-0 items-center rounded-md border px-3 text-sm',
          className
        )}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <Input
      type='time'
      className={cn(SHADCN_TIME_CLASS, className)}
      {...inputProps}
      id={id}
      step={step}
      disabled={disabled}
      value={hasValue ? value : ''}
      onChange={(e) => {
        onChange(normalizeToHHmm(e.target.value));
      }}
    />
  );
}
