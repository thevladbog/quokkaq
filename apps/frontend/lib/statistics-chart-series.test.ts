import { describe, expect, it } from 'vitest';

import type {
  ServicesSurveyScorePoint,
  ServicesTimeseriesPoint
} from '@/lib/api/generated/statistics';
import {
  buildSurveyScoreChartRows,
  buildWaitTimeseriesChartRows,
  computeSurveyScoreYDomain
} from '@/lib/statistics-chart-series';

describe('buildWaitTimeseriesChartRows', () => {
  it('fills missing hourly averages with 0', () => {
    const points: ServicesTimeseriesPoint[] = [
      { date: '2026-04-15T01:00:00', avgWaitMinutes: 12, avgServiceMinutes: 3 },
      { date: '2026-04-15T02:00:00' }
    ];
    const rows = buildWaitTimeseriesChartRows(points, 'hour');
    expect(rows[0]?.wait).toBe(12);
    expect(rows[0]?.service).toBe(3);
    expect(rows[1]?.wait).toBe(0);
    expect(rows[1]?.service).toBe(0);
  });

  it('keeps null for missing day-level averages', () => {
    const points: ServicesTimeseriesPoint[] = [{ date: '2026-04-14' }];
    const rows = buildWaitTimeseriesChartRows(points, 'day');
    expect(rows[0]?.wait).toBeNull();
    expect(rows[0]?.service).toBeNull();
  });
});

describe('buildSurveyScoreChartRows', () => {
  it('norm5 hourly: null avg becomes 0', () => {
    const points: ServicesSurveyScorePoint[] = [
      { date: '2026-04-15T08:00:00', avgScoreNorm5: 4.2 },
      { date: '2026-04-15T09:00:00' }
    ];
    const rows = buildSurveyScoreChartRows(points, undefined, 'hour');
    expect(rows[0]?.score).toBe(4.2);
    expect(rows[1]?.score).toBe(0);
  });

  it('questions mode daily: keeps null when no score', () => {
    const points: ServicesSurveyScorePoint[] = [{ date: '2026-04-14' }];
    const rows = buildSurveyScoreChartRows(points, 'questions', 'day');
    expect(rows[0]?.score).toBeNull();
  });
});

describe('computeSurveyScoreYDomain', () => {
  it('norm5 hourly uses 0..5', () => {
    expect(computeSurveyScoreYDomain([], undefined, 'hour')).toEqual([0, 5]);
  });

  it('norm5 daily uses 1..5', () => {
    expect(computeSurveyScoreYDomain([], undefined, 'day')).toEqual([1, 5]);
  });

  it('questions hourly extends domain down to at most 0', () => {
    const points: ServicesSurveyScorePoint[] = [
      { scaleMin: 1, scaleMax: 5, avgScoreNative: 4 }
    ];
    const [y0, y1] = computeSurveyScoreYDomain(points, 'questions', 'hour');
    expect(y0).toBeLessThanOrEqual(0);
    expect(y1).toBeGreaterThan(4);
  });
});
