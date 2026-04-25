'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Fits narrow modals: keys share row width (`flex-1 min-w-0`).
 * Avoid `kiosk-touch-min` here — it sets min-width: 3rem per key and prevents shrinking.
 */
const keyClass =
  'touch-manipulation h-11 min-h-11 min-w-0 flex-1 basis-0 px-0.5 text-xs font-semibold sm:h-12 sm:min-h-12 sm:text-sm md:text-base';

const backspaceClass =
  'touch-manipulation h-11 min-h-11 min-w-0 flex-[1.15] shrink px-0 text-xs font-semibold sm:h-12 sm:min-h-12 sm:text-sm md:text-base';

const spaceClass =
  'touch-manipulation h-11 min-h-11 min-w-0 flex-[2] shrink px-0 text-xs font-semibold sm:h-12 sm:min-h-12 sm:text-sm md:text-base';

const EN_ROW2 = 'QWERTYUIOP'.split('');
const EN_ROW3 = 'ASDFGHJKL'.split('');
const EN_ROW4 = 'ZXCVBNM'.split('');

/** Standard Russian ЙЦУКЕН rows (lowercase). */
const RU_ROW2 = 'йцукенгшщзхъ'.split('');
const RU_ROW3 = 'фывапролджэ'.split('');
const RU_ROW4 = 'ячсмитьбю'.split('');

const NUM_SYMBOL_ROW = '1234567890@._-'.split('');

type KioskKeyboardScript = 'en' | 'ru';

/**
 * Full on-screen touch keyboard (Latin or Russian letters + digits row). Optional EN/RU toggle.
 */
export function KioskTouchKeyboard({
  onKey,
  onBackspace,
  layoutToggle = false,
  initialLayout = 'en'
}: {
  onKey: (c: string) => void;
  onBackspace: () => void;
  /** When true, shows EN/RU switch and Cyrillic letter rows in RU mode. */
  layoutToggle?: boolean;
  /** Used with `layoutToggle` (e.g. kiosk UI locale). */
  initialLayout?: KioskKeyboardScript;
}) {
  const [script, setScript] = useState<KioskKeyboardScript>(
    layoutToggle ? initialLayout : 'en'
  );
  const t = useTranslations('kiosk');

  useEffect(() => {
    if (layoutToggle) {
      setScript(initialLayout);
    }
  }, [layoutToggle, initialLayout]);

  const row2 = script === 'ru' ? RU_ROW2 : EN_ROW2;
  const row3 = script === 'ru' ? RU_ROW3 : EN_ROW3;
  const row4 = script === 'ru' ? RU_ROW4 : EN_ROW4;

  const Key = (ch: string) => (
    <Button
      key={`${script}-${ch}`}
      type='button'
      className={keyClass}
      variant='outline'
      onClick={() => onKey(ch)}
    >
      {ch}
    </Button>
  );

  return (
    <div className='flex w-full max-w-full min-w-0 flex-col gap-2'>
      {layoutToggle ? (
        <div className='flex w-full min-w-0 gap-2'>
          <Button
            type='button'
            variant={script === 'en' ? 'default' : 'outline'}
            className='h-10 min-h-10 flex-1 touch-manipulation px-2 text-sm font-semibold sm:h-11 sm:text-base'
            aria-pressed={script === 'en'}
            aria-label={t('touch_keyboard_aria_latin', {
              defaultValue: 'Latin layout (English letters)'
            })}
            onClick={() => setScript('en')}
          >
            EN
          </Button>
          <Button
            type='button'
            variant={script === 'ru' ? 'default' : 'outline'}
            className='h-10 min-h-10 flex-1 touch-manipulation px-2 text-sm font-semibold sm:h-11 sm:text-base'
            aria-pressed={script === 'ru'}
            aria-label={t('touch_keyboard_aria_cyrillic', {
              defaultValue: 'Russian (Cyrillic) layout'
            })}
            onClick={() => setScript('ru')}
          >
            RU
          </Button>
        </div>
      ) : null}
      <div className='flex w-full min-w-0 flex-col gap-1.5 sm:gap-2'>
        <div className='flex w-full min-w-0 gap-1 sm:gap-1.5'>
          {NUM_SYMBOL_ROW.map((c) => Key(c))}
          <Button
            type='button'
            className={backspaceClass}
            variant='secondary'
            onClick={onBackspace}
            aria-label='Backspace'
          >
            ⌫
          </Button>
        </div>
        <div className='flex w-full min-w-0 gap-1 sm:gap-1.5'>
          {row2.map((c) => Key(c))}
        </div>
        <div className='flex w-full min-w-0 gap-1 sm:gap-1.5'>
          {row3.map((c) => Key(c))}
        </div>
        <div className='flex w-full min-w-0 gap-1 sm:gap-1.5'>
          {row4.map((c) => Key(c))}
          <Button
            type='button'
            className={spaceClass}
            variant='outline'
            onClick={() => onKey(' ')}
            aria-label='Space'
          >
            __
          </Button>
        </div>
      </div>
    </div>
  );
}

const NUM_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['⌫', '0', '']
] as const;

/**
 * Numeric numpad for `manualInputMode: numeric` barcode / PIN-style entry.
 * Layout: 3×3 digits, last row: backspace, 0, empty (spacer for symmetry).
 */
export function KioskTouchNumpad({
  onDigit,
  onBackspace
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div className='mx-auto flex w-full max-w-full min-w-0 flex-col gap-2.5 sm:gap-3'>
      {NUM_ROWS.map((row, i) => (
        <div
          key={i}
          className='flex w-full min-w-0 flex-nowrap justify-center gap-2.5 sm:gap-3'
        >
          {row.map((cell) => {
            if (cell === '⌫') {
              return (
                <Button
                  key='bs'
                  type='button'
                  className='h-16 min-h-[3.25rem] min-w-0 flex-1 basis-0 touch-manipulation text-xl font-semibold sm:text-2xl'
                  variant='secondary'
                  onClick={onBackspace}
                  aria-label='Backspace'
                >
                  ⌫
                </Button>
              );
            }
            if (cell === '') {
              return (
                <div
                  key='sp'
                  className='h-16 min-h-[3.25rem] min-w-0 flex-1 basis-0'
                />
              );
            }
            return (
              <Button
                key={cell}
                type='button'
                className='h-16 min-h-[3.25rem] min-w-0 flex-1 basis-0 touch-manipulation text-2xl font-semibold sm:text-3xl'
                variant='outline'
                onClick={() => onDigit(cell)}
                aria-label={cell}
              >
                {cell}
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
