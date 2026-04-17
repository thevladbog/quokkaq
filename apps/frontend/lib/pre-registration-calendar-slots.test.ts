import { describe, expect, it } from 'vitest';
import {
  formatCalendarSlotLabel,
  preRegCalendarSlotRowKey
} from './pre-registration-calendar-slots';

describe('preRegCalendarSlotRowKey', () => {
  it('includes integration id, href, and index', () => {
    expect(preRegCalendarSlotRowKey('int-1', 'https://example/e1', 0)).toBe(
      'int-1|https://example/e1|0'
    );
  });

  it('uses empty strings for missing ids', () => {
    expect(preRegCalendarSlotRowKey(undefined, undefined, 2)).toBe('||2');
  });
});

describe('formatCalendarSlotLabel', () => {
  it('returns time only when unique', () => {
    const item = { time: '10:00', calendarIntegrationId: 'a' };
    expect(formatCalendarSlotLabel(item, [item])).toBe('10:00');
  });

  it('adds integration label when times collide', () => {
    const a = {
      time: '10:00',
      calendarIntegrationId: 'i1',
      integrationLabel: 'Desk A'
    };
    const b = { time: '10:00', calendarIntegrationId: 'i2' };
    const peers = [a, b];
    expect(formatCalendarSlotLabel(a, peers)).toBe('10:00 (Desk A)');
    expect(formatCalendarSlotLabel(b, peers)).toBe('10:00 (#i2)');
  });
});
