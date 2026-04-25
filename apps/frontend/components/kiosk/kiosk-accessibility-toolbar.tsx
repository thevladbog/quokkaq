'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Accessibility,
  Contrast,
  Type,
  Volume2,
  VolumeX,
  Megaphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { useKioskA11y } from '@/contexts/kiosk-accessibility-context';
import { cn } from '@/lib/utils';
import type { KioskA11yAudioState } from '@/hooks/use-kiosk-a11y-audio';

type Props = {
  audio: KioskA11yAudioState;
  /** e.g. `kioskBaseTheme: dark` — use dark-surface control styling when HC is off. */
  onDarkBaseKioskPage?: boolean;
};

const rowBtn =
  'kiosk-touch-min flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-0 text-base font-semibold';

/**
 * Placed in the welcome hero (beside the main title): opens a popover downward with font, contrast, TTS, and speak-aloud.
 */
export function KioskAccessibilityToolbar({
  audio,
  onDarkBaseKioskPage = false
}: Props) {
  const t = useTranslations('kiosk.a11y');
  const a = useKioskA11y();
  const [open, setOpen] = useState(false);
  const hc = a.highContrast;
  const dark = !hc && onDarkBaseKioskPage;
  /** In-popover chrome: match HC look on a dark `kioskBaseTheme` as well. */
  const d = hc || dark;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='secondary'
          className={cn(
            'kiosk-touch-min relative z-10 h-16 w-16 rounded-full p-0 sm:h-[4.5rem] sm:w-[4.5rem]',
            'border-2 shadow-md',
            'focus-visible:ring-2 focus-visible:ring-offset-2',
            hc
              ? 'border-amber-400/70 bg-zinc-900/95 text-white ring-1 shadow-black/50 ring-amber-400/40 hover:bg-zinc-800 focus-visible:ring-amber-400/90'
              : dark
                ? 'border-white/30 bg-zinc-900/90 text-white ring-1 shadow-black/30 ring-white/10 hover:border-white/45 hover:bg-zinc-800 focus-visible:ring-white/50'
                : 'border-kiosk-ink/35 text-kiosk-ink hover:border-kiosk-ink/50 hover:bg-kiosk-border/15 focus-visible:ring-kiosk-ink/40 bg-white shadow-[0_4px_16px_rgba(29,27,25,0.12)]'
          )}
          aria-label={t('fab_open')}
          aria-expanded={open}
        >
          <Accessibility
            className='size-8 min-h-[1.5rem] min-w-[1.5rem] sm:size-9'
            aria-hidden
            strokeWidth={2.5}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side='bottom'
        align='end'
        sideOffset={8}
        className={cn(
          'z-[120] max-h-[min(80dvh,36rem)] w-[min(100vw-1.5rem,22rem)] overflow-y-auto p-0 shadow-lg',
          d
            ? 'border border-white/15 text-zinc-100 ' +
                (hc ? 'bg-zinc-950' : 'bg-zinc-900')
            : 'bg-popover text-popover-foreground'
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        collisionPadding={12}
      >
        <div
          className='space-y-3 p-4'
          role='group'
          aria-label={t('group_label')}
        >
          <p
            className={cn(
              'text-sm font-semibold',
              d ? 'text-zinc-100' : 'text-foreground'
            )}
          >
            {t('menu_title')}
          </p>

          <div className='space-y-2'>
            <Button
              type='button'
              variant='secondary'
              onClick={() => a.cycleFontStep()}
              className={cn(
                rowBtn,
                d
                  ? 'bg-white/10 text-white hover:bg-white/15'
                  : 'bg-kiosk-border/30 text-kiosk-ink hover:bg-kiosk-border/45'
              )}
              aria-label={t('font_size', { level: a.fontStep + 1 })}
            >
              <Type className='size-6' aria-hidden />
              <span className='min-w-[2ch] text-center'>
                {a.fontStep + 1}/3
              </span>
              <span
                className={cn(
                  'text-xs font-medium',
                  d ? 'text-zinc-400' : 'text-kiosk-ink-muted'
                )}
              >
                {t('font_size_short')}
              </span>
            </Button>

            <Button
              type='button'
              variant='secondary'
              onClick={() => a.toggleHighContrast()}
              className={cn(
                rowBtn,
                d
                  ? 'bg-white/10 text-white hover:bg-white/15'
                  : 'bg-kiosk-border/30 text-kiosk-ink hover:bg-kiosk-border/45',
                a.highContrast &&
                  (d
                    ? 'ring-2 ring-amber-400/90 ring-offset-2 ring-offset-zinc-950'
                    : 'ring-offset-background ring-2 ring-amber-500/90 ring-offset-2')
              )}
              aria-pressed={a.highContrast}
              aria-label={t('high_contrast_toggle')}
              title={t('high_contrast_hint')}
            >
              <Contrast className='size-6' />
              <span className='text-sm'>{t('high_contrast_short')}</span>
            </Button>
          </div>

          <div
            className={cn(
              'flex min-h-12 items-center justify-between gap-3 rounded-xl px-3 py-2',
              d ? 'bg-white/10' : 'bg-kiosk-border/20'
            )}
          >
            <div className='flex min-w-0 items-center gap-2'>
              {a.ttsEnabled ? (
                <Volume2
                  className={cn(
                    'size-5 shrink-0',
                    d ? 'text-zinc-100' : 'text-kiosk-ink'
                  )}
                />
              ) : (
                <VolumeX
                  className={cn(
                    'size-5 shrink-0',
                    d ? 'text-zinc-400' : 'text-kiosk-ink/60'
                  )}
                />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  d ? 'text-zinc-100' : 'text-kiosk-ink'
                )}
              >
                {t('tts_short')}
              </span>
            </div>
            <Switch
              id='kiosk-tts-popover'
              checked={a.ttsEnabled}
              onCheckedChange={(c) => a.setTtsEnabled(!!c)}
              aria-label={t('tts_toggle')}
            />
          </div>

          {a.ttsEnabled ? (
            <div
              className={cn(
                'flex min-h-12 flex-col gap-2 rounded-xl px-3 py-2 sm:flex-row sm:items-center sm:justify-between',
                d ? 'bg-white/10' : 'bg-kiosk-border/20'
              )}
            >
              <div className='flex min-w-0 items-start gap-2 sm:min-w-0 sm:flex-1'>
                <Megaphone
                  className={cn(
                    'mt-0.5 size-4 shrink-0 sm:mt-1',
                    d ? 'text-zinc-200' : 'text-kiosk-ink'
                  )}
                  aria-hidden
                />
                <div className='min-w-0 flex-1'>
                  <p
                    className={cn(
                      'text-sm font-medium',
                      d ? 'text-zinc-100' : 'text-kiosk-ink'
                    )}
                  >
                    {t('speak_aloud_label')}
                  </p>
                  <p
                    className={cn(
                      'line-clamp-2 text-xs leading-tight',
                      d ? 'text-zinc-400' : 'text-kiosk-ink-muted'
                    )}
                  >
                    {t('headphone_state', {
                      label: audio.defaultOutputName || '—'
                    })}
                  </p>
                </div>
              </div>
              <Switch
                id='kiosk-tts-aloud-popover'
                className='shrink-0 self-end sm:self-center'
                checked={a.ttsSpeakAloud}
                onCheckedChange={(c) => a.setTtsSpeakAloud(!!c)}
                aria-label={t('speak_aloud_toggle')}
              />
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
