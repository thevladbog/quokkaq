import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getCivilYmdInIanaTimeZone,
  scheduleInCalendarForTodayYmd,
  slideDateHealth,
  slideDateNeedsAttention
} from './signage-date';

describe('scheduleInCalendarForTodayYmd', () => {
  it('accepts unbounded and inclusive ends', () => {
    expect(scheduleInCalendarForTodayYmd('', '', '2025-01-10')).toBe(true);
    expect(
      scheduleInCalendarForTodayYmd('2025-01-01', '2025-01-31', '2025-01-10')
    ).toBe(true);
    expect(
      scheduleInCalendarForTodayYmd('2025-01-01', '2025-01-10', '2025-01-10')
    ).toBe(true);
  });
  it('rejects outside', () => {
    expect(
      scheduleInCalendarForTodayYmd('2025-02-01', undefined, '2025-01-10')
    ).toBe(false);
    expect(
      scheduleInCalendarForTodayYmd(undefined, '2024-12-01', '2025-01-10')
    ).toBe(false);
  });
});

describe('slideDateHealth', () => {
  it('classifies states', () => {
    expect(slideDateHealth('', '', '2025-06-01')).toBe('open');
    expect(slideDateHealth('2025-06-10', '2025-06-20', '2025-06-01')).toBe(
      'upcoming'
    );
    expect(slideDateHealth('2025-01-01', '2024-12-01', '2025-01-10')).toBe(
      'expired'
    );
  });
  it('flags expiring within 7 days', () => {
    expect(slideDateHealth('2025-01-01', '2025-01-15', '2025-01-10')).toBe(
      'active_expiring'
    );
    expect(slideDateHealth('2025-01-01', '2025-01-20', '2025-01-10')).toBe(
      'ok'
    );
  });
});

describe('getCivilYmdInIanaTimeZone', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('returns YYYY-MM-DD in the given IANA zone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-10T16:00:00.000Z'));
    // 16:00 UTC = next calendar day in UTC+8 (e.g. Singapore)
    expect(getCivilYmdInIanaTimeZone('Asia/Singapore')).toBe('2024-07-11');
  });
});

describe('slideDateNeedsAttention', () => {
  it('is true for warning states', () => {
    expect(slideDateNeedsAttention('ok')).toBe(false);
    expect(slideDateNeedsAttention('open')).toBe(false);
    expect(slideDateNeedsAttention('expired')).toBe(true);
    expect(slideDateNeedsAttention('upcoming')).toBe(true);
    expect(slideDateNeedsAttention('active_expiring')).toBe(true);
  });
});
