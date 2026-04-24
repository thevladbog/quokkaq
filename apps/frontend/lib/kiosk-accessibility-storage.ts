import { logger } from '@/lib/logger';

const STORAGE_KEY = 'quokkaq.kiosk.a11y';
export const A11Y_SCHEMA_VERSION = 1 as const;

export type KioskA11yFontStep = 0 | 1 | 2;

export type KioskA11yPersisted = {
  version: typeof A11Y_SCHEMA_VERSION;
  fontStep: KioskA11yFontStep;
  highContrast: boolean;
  ttsEnabled: boolean;
  /** If true, always use full TTS (ignore privacy guard when not using headphones / external output). */
  ttsSpeakAloud: boolean;
};

const DEFAULT_STATE: KioskA11yPersisted = {
  version: A11Y_SCHEMA_VERSION,
  fontStep: 0,
  highContrast: false,
  ttsEnabled: false,
  ttsSpeakAloud: false
};

function parseState(raw: string | null): KioskA11yPersisted {
  if (!raw) {
    return { ...DEFAULT_STATE };
  }
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v.version !== A11Y_SCHEMA_VERSION) {
      return { ...DEFAULT_STATE };
    }
    const font = Number(v.fontStep);
    const fontStep: KioskA11yFontStep = font === 1 || font === 2 ? font : 0;
    return {
      version: A11Y_SCHEMA_VERSION,
      fontStep,
      highContrast: Boolean(v.highContrast),
      ttsEnabled: Boolean(v.ttsEnabled),
      ttsSpeakAloud: Boolean(v.ttsSpeakAloud)
    };
  } catch (e) {
    logger.warn('kiosk a11y: parse localStorage failed', e);
    return { ...DEFAULT_STATE };
  }
}

export function readKioskA11yFromStorage(): KioskA11yPersisted {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_STATE };
  }
  return parseState(window.localStorage.getItem(STORAGE_KEY));
}

export function writeKioskA11yToStorage(s: KioskA11yPersisted): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...s, version: A11Y_SCHEMA_VERSION })
    );
  } catch (e) {
    logger.warn('kiosk a11y: localStorage write failed', e);
  }
}

export { DEFAULT_STATE };
