import { describe, expect, it } from 'vitest';
import {
  contrastMeetsLevel,
  contrastRatio,
  ENHANCED_CONTRAST,
  evaluateKioskConfigSurfaces,
  KIOSK_INK_CONTRAST_HEX,
  relativeLuminanceFromCssColor
} from './kiosk-wcag-contrast';

describe('kiosk-wcag-contrast', () => {
  it('relativeLuminanceFromCssColor matches hex path for #000', () => {
    expect(relativeLuminanceFromCssColor('#000000')).toBeCloseTo(0, 2);
  });

  it('contrast is 1:1 for identical colors', () => {
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
  });

  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('evaluateKioskConfigSurfaces passes for safe defaults', () => {
    const { canSave, checks } = evaluateKioskConfigSurfaces({
      headerBackground: '#f5f3f0',
      bodyBackground: '#fef8f3',
      gridBackground: '#f0ebe5'
    });
    expect(checks).toHaveLength(3);
    for (const c of checks) {
      expect(c.ratio).toBeGreaterThan(4.5);
      expect(c.passNormal).toBe(true);
    }
    expect(canSave).toBe(true);
  });

  it('fails when surface matches default ink (negligible contrast)', () => {
    const bad = KIOSK_INK_CONTRAST_HEX;
    const { canSave, checks } = evaluateKioskConfigSurfaces({
      headerBackground: bad,
      bodyBackground: bad,
      gridBackground: bad
    });
    expect(checks.every((c) => c.passNormal === false)).toBe(true);
    expect(canSave).toBe(false);
  });

  it('KIOSK_INK_CONTRAST_HEX is stable string', () => {
    expect(KIOSK_INK_CONTRAST_HEX).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('contrastMeetsLevel uses ENHANCED_CONTRAST threshold', () => {
    expect(contrastMeetsLevel(7, ENHANCED_CONTRAST)).toBe(true);
    expect(contrastMeetsLevel(6.9, ENHANCED_CONTRAST)).toBe(false);
    expect(contrastMeetsLevel(null, ENHANCED_CONTRAST)).toBe(false);
  });
});
