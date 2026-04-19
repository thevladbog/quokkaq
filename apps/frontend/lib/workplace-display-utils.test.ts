import { describe, expect, it } from 'vitest';
import { parseAdScreen, pathWithQueryNoCode } from './workplace-display-utils';

describe('parseAdScreen', () => {
  it('returns undefined when adScreen missing', () => {
    expect(parseAdScreen(undefined)).toBeUndefined();
    expect(parseAdScreen({})).toBeUndefined();
    expect(parseAdScreen({ adScreen: 'nope' })).toBeUndefined();
  });

  it('parses valid partial ad screen config', () => {
    const out = parseAdScreen({
      adScreen: { adWidthPct: 25 }
    });
    expect(out).toEqual({ adWidthPct: 25 });
  });
});

describe('pathWithQueryNoCode', () => {
  it('drops code and keeps other params', () => {
    expect(pathWithQueryNoCode('/ru/workplace-display', 'code=abc&x=1')).toBe(
      '/ru/workplace-display?x=1'
    );
  });

  it('returns pathname only when nothing left', () => {
    expect(pathWithQueryNoCode('/path', 'code=only')).toBe('/path');
  });

  it('preserves query when no code', () => {
    expect(pathWithQueryNoCode('/p', 'a=1&b=2')).toBe('/p?a=1&b=2');
  });
});
