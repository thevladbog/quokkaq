import type { KioskConfig } from '@quokkaq/shared-types';

/**
 * Kiosk look presets when `isCustomColorsEnabled` is false.
 * `high-contrast-preset` is a baked palette for bright retail / outdoor — not the a11y "high contrast" toggle.
 */
export const KIOSK_BASE_THEME_IDS = [
  'warm-light',
  'cool-light',
  'dark',
  'high-contrast-preset'
] as const;

export type KioskBaseThemeId = (typeof KIOSK_BASE_THEME_IDS)[number];

const DEFAULT_KIOSK_BASE_THEME: KioskBaseThemeId = 'warm-light';

const SURFACES: Record<
  KioskBaseThemeId,
  { header: string; body: string; serviceGrid: string }
> = {
  'warm-light': {
    header: '#fff9f4',
    body: '#fef8f3',
    serviceGrid: '#f2ebe6'
  },
  'cool-light': {
    header: '#f8faff',
    body: '#f0f4ff',
    serviceGrid: '#e8eef6'
  },
  dark: {
    header: '#0f0f0f',
    body: '#1a1a1a',
    serviceGrid: '#141414'
  },
  'high-contrast-preset': {
    header: '#000000',
    body: '#111111',
    serviceGrid: '#0a0a0a'
  }
};

export function normalizeKioskBaseThemeId(
  raw: string | null | undefined
): KioskBaseThemeId {
  const s = String(raw || '').trim();
  if (s && (KIOSK_BASE_THEME_IDS as readonly string[]).includes(s)) {
    return s as KioskBaseThemeId;
  }
  return DEFAULT_KIOSK_BASE_THEME;
}

export function getKioskBaseThemeSurfaces(
  theme: KioskBaseThemeId
): Readonly<(typeof SURFACES)[KioskBaseThemeId]> {
  return SURFACES[theme] ?? SURFACES[DEFAULT_KIOSK_BASE_THEME];
}

/**
 * `data-kiosk-base-theme` on the kiosk root for token overrides (e.g. ink on dark).
 * Omitted when using custom hex colors or HC — those paths set their own surfaces.
 */
export function getKioskBaseThemeDataAttribute(
  theme: KioskBaseThemeId
): KioskBaseThemeId | undefined {
  if (theme === 'warm-light') {
    return undefined;
  }
  return theme;
}

/**
 * Resolves effective header/body/grid for the public kiosk when not in a11y high-contrast mode.
 */
export function resolveKioskPageSurfaceHexColors(opts: {
  kiosk: KioskConfig | null | undefined;
  isCustomColorsEnabled: boolean;
}): { header: string; body: string; serviceGrid: string } {
  const k = opts.kiosk;
  if (opts.isCustomColorsEnabled) {
    return {
      header: (k?.headerColor || '#fff9f4').trim(),
      body: (k?.bodyColor || '#fef8f3').trim(),
      serviceGrid: (k?.serviceGridColor || '#f2ebe6').trim()
    };
  }
  const t = normalizeKioskBaseThemeId(k?.kioskBaseTheme);
  return { ...getKioskBaseThemeSurfaces(t) };
}
