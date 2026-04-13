import { describe, expect, it } from 'vitest';
import { encodeCp1251 } from './cp1251-encode';

describe('encodeCp1251', () => {
  it('encodes ASCII unchanged', () => {
    expect([...encodeCp1251('abc123')]).toEqual([
      0x61, 0x62, 0x63, 0x31, 0x32, 0x33
    ]);
  });

  it('encodes capital Cyrillic А as Windows-1251 0xC0', () => {
    expect(encodeCp1251('А').length).toBe(1);
    expect(encodeCp1251('А')[0]).toBe(0xc0);
  });

  it('encodes lowercase Cyrillic я', () => {
    expect(encodeCp1251('я')[0]).toBe(0xff);
  });

  it('maps unmapped Unicode to question mark', () => {
    expect([...encodeCp1251('\u3042')]).toEqual([0x3f]);
  });
});
