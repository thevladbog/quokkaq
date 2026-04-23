import { describe, expect, it } from 'vitest';
import {
  contrastMeetsLevel,
  contrastRatio,
  ENHANCED_CONTRAST
} from './kiosk-wcag-contrast';
import { KIOSK_FORCED_HIGH_CONTRAST } from './kiosk-hc-palette';

describe('kiosk-hc-palette (forced) contrast', () => {
  const f = KIOSK_FORCED_HIGH_CONTRAST;

  const pairs: { name: string; fg: string; bg: string }[] = [
    { name: 'header title', fg: f.textOnHeader, bg: f.headerBackground },
    { name: 'body', fg: f.textOnBody, bg: f.bodyBackground },
    { name: 'muted on body', fg: f.textMuted, bg: f.bodyBackground },
    {
      name: 'body text on service grid',
      fg: f.textOnBody,
      bg: f.serviceGridBackground
    },
    {
      name: 'muted on service grid',
      fg: f.textMuted,
      bg: f.serviceGridBackground
    },
    {
      name: 'logo surround border vs header',
      fg: f.logoSurround,
      bg: f.headerBackground
    },
    {
      name: 'strong border on header',
      fg: f.borderStrong,
      bg: f.headerBackground
    },
    {
      name: 'focus ring on service grid',
      fg: f.focusRing,
      bg: f.serviceGridBackground
    }
  ];

  it('forced palette text and focus pairs meet ENHANCED_CONTRAST (7:1)', () => {
    for (const p of pairs) {
      const r = contrastRatio(p.fg, p.bg);
      expect(r, `${p.name} (${p.fg} on ${p.bg})`).not.toBeNull();
      expect(contrastMeetsLevel(r, ENHANCED_CONTRAST), p.name).toBe(true);
    }
  });
});
