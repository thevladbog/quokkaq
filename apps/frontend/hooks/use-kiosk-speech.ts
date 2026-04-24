import { useCallback, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useKioskA11y } from '@/contexts/kiosk-accessibility-context';
import { intlLocaleFromAppLocale } from '@/lib/format-datetime';
import type { KioskA11yAudioState } from './use-kiosk-a11y-audio';

let warnedNoSpeech = false;

export function useKioskSpeech(audio: KioskA11yAudioState): {
  canSpeak: boolean;
  /** Speak if `canSpeak`; cancels the previous utterance. */
  speak: (text: string) => void;
  cancel: () => void;
} {
  const a11y = useKioskA11y();
  const loc = useLocale();
  const intl = intlLocaleFromAppLocale(loc);
  const rafRef = useRef<number | null>(null);

  const canSpeak = Boolean(
    a11y.ttsEnabled && (a11y.ttsSpeakAloud || audio.isLikelyHeadphones)
  );

  const cancel = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      if (!canSpeak) {
        return;
      }
      if (!text.trim()) {
        return;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = intl;
        u.onerror = () => {
          if (!warnedNoSpeech) {
            console.warn('speech synthesis error (kiosk tts)');
            warnedNoSpeech = true;
          }
        };
        synth.speak(u);
      });
    },
    [canSpeak, intl]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      cancel();
    };
  }, [cancel]);

  return { canSpeak, speak, cancel };
}
