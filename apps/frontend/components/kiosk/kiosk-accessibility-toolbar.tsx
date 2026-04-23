'use client';

import { useTranslations } from 'next-intl';
import { Contrast, Type, Volume2, VolumeX, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useKioskA11y } from '@/contexts/kiosk-accessibility-context';
import { cn } from '@/lib/utils';
import type { KioskA11yAudioState } from '@/hooks/use-kiosk-a11y-audio';

const touchBtn =
  'kiosk-touch-min flex min-h-12 min-w-12 items-center justify-center';

type Props = { audio: KioskA11yAudioState };

export function KioskAccessibilityToolbar({ audio }: Props) {
  const t = useTranslations('kiosk.a11y');
  const a = useKioskA11y();

  return (
    <div
      className='text-kiosk-ink flex flex-wrap items-center justify-end gap-1 sm:gap-2'
      role='group'
      aria-label={t('group_label')}
    >
      <Button
        type='button'
        variant='secondary'
        onClick={() => a.cycleFontStep()}
        className={cn(
          touchBtn,
          'shrink-0 gap-1 rounded-full border-0 bg-[#f2ede8] px-3 text-base font-bold shadow-sm'
        )}
        aria-label={t('font_size', { level: a.fontStep + 1 })}
      >
        <Type className='size-6' aria-hidden />
        <span className='min-w-[1.25ch] text-center'>{a.fontStep + 1}/3</span>
      </Button>
      <Button
        type='button'
        variant='secondary'
        onClick={() => a.toggleHighContrast()}
        className={cn(
          touchBtn,
          'shrink-0 rounded-full border-0 bg-[#f2ede8] shadow-sm',
          a.highContrast && 'ring-2 ring-amber-500 ring-offset-2'
        )}
        aria-pressed={a.highContrast}
        aria-label={t('high_contrast_toggle')}
        title={t('high_contrast_hint')}
      >
        <Contrast className='size-6' />
      </Button>
      <div
        className={cn(
          'flex min-h-12 items-center gap-1.5 rounded-full border-0 bg-[#f2ede8] px-2 py-1.5 pl-2 sm:pl-2.5'
        )}
      >
        {a.ttsEnabled ? (
          <Volume2 className='text-kiosk-ink size-5 shrink-0' />
        ) : (
          <VolumeX className='text-kiosk-ink/60 size-5 shrink-0' />
        )}
        <Switch
          id='kiosk-tts'
          checked={a.ttsEnabled}
          onCheckedChange={(c) => a.setTtsEnabled(!!c)}
          aria-label={t('tts_toggle')}
        />
      </div>
      {a.ttsEnabled ? (
        <div className='flex min-h-12 max-w-[10rem] min-w-12 items-center gap-1.5 rounded-full border-0 bg-[#f2ede8] px-2.5 sm:min-w-0 sm:px-2'>
          <Megaphone
            className='text-kiosk-ink size-4 shrink-0 sm:size-5'
            aria-hidden
          />
          <div className='min-w-0 flex-1'>
            <p className='text-kiosk-ink truncate text-xs leading-tight font-medium sm:text-sm'>
              {t('speak_aloud_label')}
            </p>
            <p className='text-kiosk-ink-muted line-clamp-1 text-[0.6rem] leading-tight sm:text-xs'>
              {t('headphone_state', { label: audio.defaultOutputName || '—' })}
            </p>
          </div>
          <Switch
            id='kiosk-tts-aloud'
            className='shrink-0'
            checked={a.ttsSpeakAloud}
            onCheckedChange={(c) => a.setTtsSpeakAloud(!!c)}
            aria-label={t('speak_aloud_toggle')}
          />
        </div>
      ) : null}
    </div>
  );
}
