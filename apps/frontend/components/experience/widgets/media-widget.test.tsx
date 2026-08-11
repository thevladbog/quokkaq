import { describe, expect, it } from 'vitest';

import { parseExperienceMediaConfig } from './media-widget';

describe('parseExperienceMediaConfig', () => {
  it('accepts local and http image sources and normalizes fit', () => {
    expect(
      parseExperienceMediaConfig({
        src: '/media/welcome.webp',
        alt: 'Welcome',
        fit: 'cover'
      })
    ).toEqual({
      src: '/media/welcome.webp',
      alt: 'Welcome',
      fit: 'cover',
      fallback: 'Media unavailable'
    });
  });

  it('rejects executable and malformed sources', () => {
    expect(parseExperienceMediaConfig({ src: 'javascript:alert(1)' }).src).toBe(
      ''
    );
    expect(parseExperienceMediaConfig({ src: 'not a url' }).src).toBe('');
  });
});
