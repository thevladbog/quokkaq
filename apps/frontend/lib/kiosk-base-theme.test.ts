import { describe, expect, it } from 'vitest';
import {
  getKioskBaseThemeDataAttribute,
  getKioskBaseThemeSurfaces,
  normalizeKioskBaseThemeId,
  resolveKioskPageSurfaceHexColors
} from './kiosk-base-theme';

describe('kiosk-base-theme', () => {
  it('normalizes unknown to warm-light', () => {
    expect(normalizeKioskBaseThemeId(undefined)).toBe('warm-light');
    expect(normalizeKioskBaseThemeId('')).toBe('warm-light');
    expect(normalizeKioskBaseThemeId('nope')).toBe('warm-light');
  });

  it('getKioskBaseThemeDataAttribute omits warm-light', () => {
    expect(getKioskBaseThemeDataAttribute('warm-light')).toBeUndefined();
    expect(getKioskBaseThemeDataAttribute('dark')).toBe('dark');
  });

  it('resolveKioskPageSurfaceHexColors uses presets when not custom', () => {
    const c = resolveKioskPageSurfaceHexColors({
      kiosk: { kioskBaseTheme: 'cool-light' },
      isCustomColorsEnabled: false
    });
    expect(c.header.toLowerCase()).toContain('f8');
    expect(
      resolveKioskPageSurfaceHexColors({
        kiosk: {
          headerColor: '#ff0000',
          bodyColor: '#00ff00',
          serviceGridColor: '#0000ff'
        },
        isCustomColorsEnabled: true
      }).header
    ).toBe('#ff0000');
  });

  it('getKioskBaseThemeSurfaces has dark surfaces', () => {
    const s = getKioskBaseThemeSurfaces('dark');
    expect(s.body).toMatch(/^#/);
  });
});
