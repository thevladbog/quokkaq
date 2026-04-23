'use client';

import type { KeyboardEventHandler } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function hexForPicker(css: string | undefined, fallback: string): string {
  const v = css?.trim() ?? '';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    return v.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const a = v.slice(1);
    return `#${a[0]!}${a[0]!}${a[1]!}${a[1]!}${a[2]!}${a[2]!}`.toLowerCase();
  }
  if (!v || v === 'transparent') {
    return fallback;
  }
  return fallback;
}

type Props = {
  id: string;
  label: string;
  value: string | undefined;
  onValueChange: (next: string) => void;
  /** Fired only from the color well (always `#rrggbb`). */
  onWellChange?: (hex: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Shown in the native picker when value is not a 6-digit hex. */
  pickerFallback?: string;
  onTextBlur?: () => void;
  onTextKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  className?: string;
};

/**
 * CSS color (hex, named, etc.) with a native color well for 6-digit hex + text field.
 */
export function CssColorField({
  id,
  label,
  value,
  onValueChange,
  onWellChange,
  disabled,
  placeholder = '#rrggbb',
  pickerFallback = '#0f172a',
  onTextBlur,
  onTextKeyDown,
  className
}: Props) {
  const hex = hexForPicker(value, pickerFallback);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label
        className='text-muted-foreground flex min-h-12 items-end text-xs leading-snug'
        htmlFor={`${id}-text`}
      >
        {label}
      </Label>
      <div className='flex h-8 min-w-0 items-center gap-2'>
        <input
          type='color'
          className='border-input h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50'
          value={hex}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => {
            const v = e.target.value;
            onWellChange?.(v);
            onValueChange(v);
          }}
        />
        <Input
          id={`${id}-text`}
          className='h-8 min-w-0 flex-1 font-mono text-xs'
          placeholder={placeholder}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => {
            onValueChange(e.target.value);
          }}
          onBlur={onTextBlur}
          onKeyDown={onTextKeyDown}
        />
      </div>
    </div>
  );
}
