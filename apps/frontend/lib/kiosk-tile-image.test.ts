import { describe, expect, it } from 'vitest';

import {
  isLikelyEmojiIconString,
  resolveKioskTileImageKind
} from './kiosk-tile-image';

describe('resolveKioskTileImageKind', () => {
  it('returns none for empty', () => {
    expect(resolveKioskTileImageKind('')).toBe('none');
    expect(resolveKioskTileImageKind('   ')).toBe('none');
    expect(resolveKioskTileImageKind(null)).toBe('none');
  });

  it('detects http(s) as url', () => {
    expect(resolveKioskTileImageKind('https://x/y.png')).toBe('url');
  });

  it('detects data svg', () => {
    expect(resolveKioskTileImageKind('data:image/svg+xml,<svg></svg>')).toBe(
      'data_svg'
    );
  });

  it('detects emoji', () => {
    expect(resolveKioskTileImageKind('🦷')).toBe('emoji');
  });
});

describe('isLikelyEmojiIconString', () => {
  it('rejects url and text', () => {
    expect(isLikelyEmojiIconString('https://a')).toBe(false);
    expect(isLikelyEmojiIconString('hello')).toBe(false);
  });
});
