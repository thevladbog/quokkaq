import { describe, expect, it } from 'vitest';

import {
  formatStatisticsAsOfLine,
  formatStatisticsTooltipLabel,
  parseStatisticsApiDate
} from '@/lib/statistics-chart-dates';
import { enUS, ru } from 'date-fns/locale';

describe('parseStatisticsApiDate', () => {
  it('parses YYYY-MM-DD as local calendar date (no UTC day shift)', () => {
    const d = parseStatisticsApiDate('2026-06-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
  });

  it('parses RFC3339 UTC as instant', () => {
    const d = parseStatisticsApiDate('2026-04-15T12:00:00.000Z');
    expect(d.toISOString()).toBe('2026-04-15T12:00:00.000Z');
  });

  it('parses naive hourly bucket as local wall time', () => {
    const d = parseStatisticsApiDate('2026-04-15T08:00:00');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(0);
  });
});

describe('formatStatisticsAsOfLine', () => {
  it('formats UTC timestamp in locale-appropriate style', () => {
    const s = formatStatisticsAsOfLine('2026-04-15T12:00:00.000Z', enUS);
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/Apr/);
    const sRu = formatStatisticsAsOfLine('2026-04-15T12:00:00.000Z', ru);
    expect(sRu).toMatch(/2026/);
    expect(sRu).toMatch(/апр/);
  });
});

describe('formatStatisticsTooltipLabel', () => {
  it('uses date + time with seconds when hourly', () => {
    const s = formatStatisticsTooltipLabel('2026-04-15T08:30:45', {
      hourly: true,
      locale: enUS
    });
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/30:45/);
  });

  it('uses long date only when daily', () => {
    const s = formatStatisticsTooltipLabel('2026-04-15', {
      hourly: false,
      locale: ru
    });
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/апр/);
  });
});
