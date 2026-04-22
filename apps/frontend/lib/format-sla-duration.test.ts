import { describe, it, expect } from 'vitest';
import { formatSlaDuration } from './format-sla-duration';

type StatsTranslate = Parameters<typeof formatSlaDuration>[1];

// Mock translation function for English locale
const mockT = ((key: string, params?: Record<string, string | number>) => {
  const translations: Record<string, string> = {
    minutes_short: 'min',
    duration_format_min_sec: `${params?.minutes}m ${params?.seconds}s`
  };
  return translations[key] || key;
}) as StatsTranslate;

describe('formatSlaDuration', () => {
  it('returns "0 min" for zero seconds', () => {
    expect(formatSlaDuration(0, mockT)).toBe('0 min');
  });

  it('returns whole minutes without seconds part when no remainder', () => {
    expect(formatSlaDuration(60, mockT)).toBe('1 min');
    expect(formatSlaDuration(120, mockT)).toBe('2 min');
    expect(formatSlaDuration(3600, mockT)).toBe('60 min');
  });

  it('includes seconds when duration is not an exact minute', () => {
    expect(formatSlaDuration(90, mockT)).toBe('1m 30s');
    expect(formatSlaDuration(61, mockT)).toBe('1m 01s');
    expect(formatSlaDuration(3661, mockT)).toBe('61m 01s');
  });

  it('handles sub-minute durations', () => {
    expect(formatSlaDuration(30, mockT)).toBe('0m 30s');
    expect(formatSlaDuration(1, mockT)).toBe('0m 01s');
    expect(formatSlaDuration(59, mockT)).toBe('0m 59s');
  });
});
