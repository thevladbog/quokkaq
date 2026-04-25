import { describe, expect, it } from 'vitest';
import {
  formatUnknownAnomalyKindLabel,
  getAnomalyKindLabel,
  getAnomalyMessage,
  isKnownAnomalyKind,
  type KnownAnomalyKind
} from '@/lib/anomaly-i18n';

const mockT = (k: string) => `[${k}]`;

describe('isKnownAnomalyKind', () => {
  it.each([['arrival_spike'], ['mass_no_show'], ['slow_service']])(
    '%s is known',
    (k) => {
      expect(isKnownAnomalyKind(k)).toBe(true);
    }
  );
  it('treats unknown and empty as not known', () => {
    expect(isKnownAnomalyKind('future_code')).toBe(false);
    expect(isKnownAnomalyKind('')).toBe(false);
    expect(isKnownAnomalyKind(undefined)).toBe(false);
  });
  it('narrows type for known codes', () => {
    const k: string = 'slow_service';
    if (isKnownAnomalyKind(k)) {
      const _x: KnownAnomalyKind = k;
      void _x;
    }
  });
});

describe('formatUnknownAnomalyKindLabel', () => {
  it('replaces underscores with spaces', () => {
    expect(formatUnknownAnomalyKindLabel('weird_future_kind')).toBe(
      'weird future kind'
    );
  });
});

describe('getAnomalyKindLabel', () => {
  it('maps known kinds via t', () => {
    expect(getAnomalyKindLabel('slow_service', mockT)).toBe(
      '[kind_slow_service]'
    );
  });
  it('uses formatted kind for unknown', () => {
    expect(getAnomalyKindLabel('custom_alert', mockT)).toBe('custom alert');
  });
  it('empty kind em dash', () => {
    expect(getAnomalyKindLabel('', mockT)).toBe('—');
    expect(getAnomalyKindLabel(undefined, mockT)).toBe('—');
  });
});

describe('getAnomalyMessage', () => {
  it('maps known kinds via t', () => {
    expect(getAnomalyMessage('arrival_spike', 'en fallback', mockT)).toBe(
      '[message_arrival_spike]'
    );
  });
  it('unknown kind uses message fallback', () => {
    expect(getAnomalyMessage('custom', 'Server text in English', mockT)).toBe(
      'Server text in English'
    );
  });
  it('unknown kind no fallback uses formatted kind', () => {
    expect(getAnomalyMessage('foo_bar', '', mockT)).toBe('foo bar');
  });
  it('missing kind+message', () => {
    expect(getAnomalyMessage(undefined, null, mockT)).toBe('—');
  });
});
