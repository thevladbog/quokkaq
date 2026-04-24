import { invoke } from '@tauri-apps/api/core';

import { isTauriKiosk } from './kiosk-print';

export type KioskOcrEngineSource = 'tesseract_cli' | 'tesseract_js';

export type KioskOcrResult = { text: string; source: KioskOcrEngineSource };

/**
 * 5.4: native Tauri path — spawns the host `tesseract` binary; image is temp-file only (not persisted in app data).
 */
export async function runKioskOcrTauriFromBase64(
  imageBase64: string
): Promise<KioskOcrResult> {
  if (!isTauriKiosk()) {
    throw new Error('Tauri desktop shell required for native OCR');
  }
  const raw = await invoke<unknown>('kiosk_tesseract_ocr_from_image', {
    imageBase64
  });
  if (!raw || typeof raw !== 'object' || !('text' in raw)) {
    throw new Error('Invalid OCR response');
  }
  const o = raw as { text?: string; source?: string };
  const t = (o.text ?? '').trim();
  return { text: t, source: 'tesseract_cli' };
}

export function isNativeKioskOcrAvailable(): boolean {
  return isTauriKiosk();
}
