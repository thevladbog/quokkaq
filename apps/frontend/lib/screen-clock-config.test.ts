import { describe, it, expect } from 'vitest';
import {
  parseClockDisplayMode,
  clockUse24HourFromConfig
} from './screen-clock-config';

describe('parseClockDisplayMode', () => {
  it('prefers clockTimeFormat', () => {
    expect(
      parseClockDisplayMode({ clockTimeFormat: '12h', use24h: true })
    ).toBe('12h');
  });
  it('maps legacy use24h', () => {
    expect(parseClockDisplayMode({ use24h: true })).toBe('24h');
    expect(parseClockDisplayMode({ use24h: false })).toBe('12h');
  });
  it('defaults to locale', () => {
    expect(parseClockDisplayMode(undefined)).toBe('locale');
    expect(parseClockDisplayMode({})).toBe('locale');
  });
});

describe('clockUse24HourFromConfig', () => {
  it('matches display mode', () => {
    expect(clockUse24HourFromConfig({ clockTimeFormat: '24h' })).toBe(true);
    expect(clockUse24HourFromConfig({ clockTimeFormat: '12h' })).toBe(false);
    expect(clockUse24HourFromConfig({ clockTimeFormat: 'locale' })).toBe(
      undefined
    );
  });
});
