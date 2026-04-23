/**
 * WCAG 2.x relative luminance and contrast ratio.
 * @see https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */

const SRGB_CUTOFF = 0.04045;
const SRGB_A = 0.055;
const SRGB_D = 12.92;
const SRGB_POW = 2.4;

function hexToRgbTriplet(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, '').trim();
  if (h.length === 3) {
    const a = h[0]! + h[0]!;
    const b = h[1]! + h[1]!;
    const c = h[2]! + h[2]!;
    return [
      parseInt(a, 16) / 255,
      parseInt(b, 16) / 255,
      parseInt(c, 16) / 255
    ];
  }
  if (h.length === 6 && /^[0-9a-fA-F]{6}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }
  if (h.length === 8 && /^[0-9a-fA-F]{8}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }
  return null;
}

function srgbToLinear(c: number): number {
  if (c <= SRGB_CUTOFF) {
    return c / SRGB_D;
  }
  return ((c + SRGB_A) / 1.055) ** SRGB_POW;
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgbTriplet(hex);
  if (!rgb) {
    return null;
  }
  const [r, g, b] = [
    srgbToLinear(rgb[0]!),
    srgbToLinear(rgb[1]!),
    srgbToLinear(rgb[2]!)
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @returns null if a color is not a 3/6/8-digit hex, else contrast for (fg on bg)
 */
export function contrastRatio(
  foregroundHex: string,
  backgroundHex: string
): number | null {
  const L1 = relativeLuminance(foregroundHex);
  const L2 = relativeLuminance(backgroundHex);
  if (L1 == null || L2 == null) {
    return null;
  }
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  if (darker < 0) {
    return null;
  }
  return (lighter + 0.05) / (darker + 0.05);
}

/** Aligned to `--color-kiosk-ink: oklch(0.3 0.035 55)` (approx. #403a36). */
export const KIOSK_INK_CONTRAST_HEX = '#3f3a36';
/** Muted body copy on default surfaces. */
export const KIOSK_INK_MUTED_CONTRAST_HEX = '#5a534e';

export type KioskColorContrastCheck = {
  label: 'header' | 'body' | 'grid';
  ratio: number | null;
  passNormal: boolean;
  passLarge: boolean;
};

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

export function evaluateKioskConfigSurfaces(planes: {
  headerBackground: string;
  bodyBackground: string;
  gridBackground: string;
}): { checks: KioskColorContrastCheck[]; canSave: boolean } {
  const bgs: Array<{ key: 'header' | 'body' | 'grid'; hex: string }> = [
    { key: 'header', hex: planes.headerBackground },
    { key: 'body', hex: planes.bodyBackground },
    { key: 'grid', hex: planes.gridBackground }
  ];
  const checks: KioskColorContrastCheck[] = bgs.map(({ key, hex }) => {
    const r = contrastRatio(KIOSK_INK_CONTRAST_HEX, hex);
    if (r == null) {
      return {
        label: key,
        ratio: null,
        passNormal: false,
        passLarge: false
      };
    }
    return {
      label: key,
      ratio: r,
      passNormal: r >= AA_NORMAL,
      passLarge: r >= AA_LARGE
    };
  });
  const canSave = checks.every((c) => c.ratio != null && c.passNormal);
  return { checks, canSave };
}

export const WCAG = {
  AA_NORMAL,
  AA_LARGE
} as const;

/** Product target for forced high-contrast text on dark surfaces. */
export const ENHANCED_CONTRAST = 7.0;

export function contrastMeetsLevel(
  ratio: number | null,
  level: number
): boolean {
  return ratio != null && ratio >= level;
}
