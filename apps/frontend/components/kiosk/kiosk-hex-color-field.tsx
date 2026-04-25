'use client';

import { useCallback } from 'react';
import Color from 'color';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  ColorPicker,
  ColorPickerAlpha,
  ColorPickerEyeDropper,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection
} from '@/components/kibo-ui/color-picker';

type Rgba = [number, number, number, number];

function rgbaTupleToHex6(r: number, g: number, b: number) {
  return Color.rgb(r, g, b).alpha(1).hex();
}

function parseToHex6(raw: string) {
  const t = raw.trim();
  if (!t) {
    return t;
  }
  try {
    return Color(t).hex();
  } catch {
    return t;
  }
}

type KioskSettingsHexColorFieldProps = {
  value: string;
  onValueChange: (v: string) => void;
  textPlaceholder?: string;
  className?: string;
  popoverA11yLabel?: string;
  textInputId: string;
};

/**
 * [Kibo UI](https://www.kibo-ui.com/components/color-picker) in a popover, plus a hex text field
 * (same as before for quick paste and parity with the native &lt;input type="color" /&gt; row).
 */
export function KioskSettingsHexColorField({
  value,
  onValueChange,
  textPlaceholder = '#000000',
  className,
  popoverA11yLabel = 'Color picker',
  textInputId
}: KioskSettingsHexColorFieldProps) {
  const safe = value && value.trim() !== '' ? value : textPlaceholder;
  const handleRgba = useCallback(
    (t: Rgba) => {
      const hex = rgbaTupleToHex6(t[0]!, t[1]!, t[2]!);
      if (parseToHex6(safe) === parseToHex6(hex)) {
        return;
      }
      onValueChange(hex);
    },
    [onValueChange, safe]
  );
  return (
    <div className={cn('flex w-full min-w-0 items-center gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className='ring-border/60 border-border focus-visible:ring-ring h-10 w-12 flex-shrink-0 p-0 shadow-sm ring-1 ring-inset focus-visible:ring-2'
            style={{ backgroundColor: safe }}
            title={value}
            aria-label={popoverA11yLabel}
          />
        </PopoverTrigger>
        <PopoverContent
          className='w-80 p-3'
          align='start'
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className='w-full max-w-md min-w-0'>
            <ColorPicker className='gap-3' onChange={handleRgba} value={safe}>
              <div className='h-32 w-full'>
                <ColorPickerSelection className='h-full' />
              </div>
              <div className='flex items-center gap-2'>
                <ColorPickerHue className='min-w-0 flex-1' />
                <ColorPickerAlpha className='min-w-0 flex-1' />
                <ColorPickerEyeDropper className='shrink-0' />
              </div>
              <div className='flex w-full min-w-0 items-end gap-2'>
                <ColorPickerOutput className='w-20 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <ColorPickerFormat className='w-full' />
                </div>
              </div>
            </ColorPicker>
          </div>
        </PopoverContent>
      </Popover>
      <Input
        id={textInputId}
        type='text'
        className='min-w-0 flex-1'
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={textPlaceholder}
        spellCheck={false}
        autoComplete='off'
      />
    </div>
  );
}
