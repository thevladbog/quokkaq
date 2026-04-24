import { useEffect, useMemo, useState } from 'react';
import { subscribeKioskTauriAudio } from '@/lib/kiosk-tauri-audio';
import { isTauriKiosk } from '@/lib/kiosk-print';

export type UseKioskA11yAudioOptions = {
  /** Re-run `enumerateDevices` when TTS is enabled (labels may unlock in some browsers). */
  ttsEnabled?: boolean;
};

function labelSuggestsHeadphones(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes('headphone') ||
    l.includes('headset') ||
    l.includes('earphone') ||
    l.includes('airpods') ||
    l.includes('earpods') ||
    (l.includes('bluetooth') && l.includes('head')) ||
    (l.includes('usb') && l.includes('head'))
  );
}

export type KioskA11yAudioState = {
  source: 'tauri' | 'web' | 'unknown';
  defaultOutputName: string;
  isLikelyHeadphones: boolean;
};

/**
 * Tauri: hardware output (cpal). Web: heuristics on `MediaDevices` / labels when not in Tauri.
 *
 * **Web Speech API:** `speechSynthesis` and its output are not an `HTMLMediaElement` — the browser
 * does not support `setSinkId()` for TTS. Routing follows the system default output; use the
 * Tauri app when you need explicit device reporting.
 */
export function useKioskA11yAudio(
  options: UseKioskA11yAudioOptions = {}
): KioskA11yAudioState {
  const ttsEnabled = options.ttsEnabled ?? false;
  const [tauriState, setTauriState] = useState<{
    name: string;
    likely: boolean;
  } | null>(null);

  const [webState, setWebState] = useState<{
    name: string;
    likely: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isTauriKiosk()) {
      return undefined;
    }
    return subscribeKioskTauriAudio((p) => {
      setTauriState({
        name: p.defaultOutputName,
        likely: p.isLikelyHeadphones
      });
    });
  }, []);

  useEffect(() => {
    if (isTauriKiosk()) {
      return undefined;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return undefined;
    }
    const refresh = async () => {
      try {
        const d = await navigator.mediaDevices.enumerateDevices();
        const outs = d.filter((x) => x.kind === 'audiooutput');
        const withLabel = outs.find((o) => o.label.trim().length > 0);
        const def = outs.find((o) => o.deviceId === 'default') ?? outs[0];
        const name = withLabel?.label?.trim() || def?.label?.trim() || '';
        if (name) {
          setWebState({ name, likely: labelSuggestsHeadphones(name) });
        } else {
          setWebState({ name: '', likely: false });
        }
      } catch {
        setWebState((s) => s ?? { name: '', likely: false });
      }
    };
    void refresh();
    const onDev = () => {
      void refresh();
    };
    navigator.mediaDevices.addEventListener('devicechange', onDev);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onDev);
    };
  }, [ttsEnabled]);

  const merged = useMemo(() => {
    if (isTauriKiosk() && tauriState) {
      return {
        source: 'tauri' as const,
        defaultOutputName: tauriState.name,
        isLikelyHeadphones: tauriState.likely
      };
    }
    if (webState) {
      return {
        source: 'web' as const,
        defaultOutputName: webState.name,
        isLikelyHeadphones: webState.likely
      };
    }
    return {
      source: 'unknown' as const,
      defaultOutputName: '',
      isLikelyHeadphones: false
    };
  }, [tauriState, webState]);

  return merged;
}
