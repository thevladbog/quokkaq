import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isTauriKiosk } from '@/lib/kiosk-print';

export type KioskTauriAudioPayload = {
  defaultOutputName: string;
  isLikelyHeadphones: boolean;
  source: 'tauri';
};

export function subscribeKioskTauriAudio(
  onState: (s: KioskTauriAudioPayload) => void
): () => void {
  if (!isTauriKiosk() || typeof window === 'undefined') {
    return () => {};
  }
  let unlisten: UnlistenFn | undefined;
  const run = async () => {
    try {
      const initial = await invoke<KioskTauriAudioPayload>(
        'kiosk_get_audio_output_state'
      );
      onState(initial);
    } catch {
      /* ignore: permissions / no device */
    }
    try {
      unlisten = await listen<KioskTauriAudioPayload>(
        'kiosk-audio-output',
        (e) => {
          if (e.payload) {
            onState(e.payload);
          }
        }
      );
    } catch {
      /* no events */
    }
  };
  void run();
  return () => {
    if (unlisten) {
      void unlisten();
    }
  };
}
