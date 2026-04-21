import { describe, it, expect } from 'vitest';
import { formatSlaDuration } from './format-sla-duration';

describe('formatSlaDuration', () => {
  it('returns "0 min" for zero seconds', () => {
    expect(formatSlaDuration(0)).toBe('0 min');
  });

  it('returns whole minutes without seconds part when no remainder', () => {
    expect(formatSlaDuration(60)).toBe('1 min');
    expect(formatSlaDuration(120)).toBe('2 min');
    expect(formatSlaDuration(3600)).toBe('60 min');
  });

  it('includes seconds when duration is not an exact minute', () => {
    expect(formatSlaDuration(90)).toBe('1m 30s');
    expect(formatSlaDuration(61)).toBe('1m 1s');
    expect(formatSlaDuration(3661)).toBe('61m 1s');
  });

  it('handles sub-minute durations', () => {
    expect(formatSlaDuration(30)).toBe('0m 30s');
    expect(formatSlaDuration(1)).toBe('0m 1s');
    expect(formatSlaDuration(59)).toBe('0m 59s');
  });
});
