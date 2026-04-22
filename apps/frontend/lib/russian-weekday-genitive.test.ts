import { describe, expect, it } from 'vitest';
import { russianWeekdayGenitive } from './russian-weekday-genitive';

describe('russianWeekdayGenitive', () => {
  it('returns genitive for Wednesday (22 Apr 2026)', () => {
    const d = new Date(2026, 3, 22);
    expect(russianWeekdayGenitive(d)).toBe('среды');
  });

  it('covers all weekdays', () => {
    // 2026-04-19 Sun … 2026-04-25 Sat
    const expected = [
      'воскресенья',
      'понедельника',
      'вторника',
      'среды',
      'четверга',
      'пятницы',
      'субботы'
    ];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 3, 19 + i);
      expect(russianWeekdayGenitive(d)).toBe(expected[i]);
    }
  });
});
