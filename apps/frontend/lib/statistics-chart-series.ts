import type {
  ServicesSurveyScorePoint,
  ServicesTimeseriesPoint
} from '@/lib/api/generated/statistics';

export type WaitTimeseriesChartRow = {
  date: string | undefined;
  wait: number | null;
  service: number | null;
  created: number | undefined;
  completed: number | undefined;
};

/**
 * Maps statistics timeseries points to chart rows. For hourly granularity, missing
 * wait/service averages become 0 so the line reaches the axis instead of a multi-hour gap.
 */
export function buildWaitTimeseriesChartRows(
  points: ServicesTimeseriesPoint[] | undefined,
  granularity: string | undefined
): WaitTimeseriesChartRow[] {
  const pts = points ?? [];
  const hourly = granularity === 'hour';
  return pts.map((p) => {
    const w = p.avgWaitMinutes;
    const s = p.avgServiceMinutes;
    const wOk = w != null && Number.isFinite(w);
    const sOk = s != null && Number.isFinite(s);
    return {
      date: p.date,
      wait: wOk ? w : hourly ? 0 : null,
      service: sOk ? s : hourly ? 0 : null,
      created: p.ticketsCreated,
      completed: p.ticketsCompleted
    };
  });
}

export type SurveyScoreChartRow = {
  date: string | undefined;
  score: number | null;
};

/** Same hourly fill-to-zero behavior as wait/service for guest survey line charts. */
export function buildSurveyScoreChartRows(
  points: ServicesSurveyScorePoint[] | undefined,
  mode: string | undefined,
  granularity: string | undefined
): SurveyScoreChartRow[] {
  const pts = points ?? [];
  const hourly = granularity === 'hour';
  if (mode === 'questions') {
    return pts.map((p) => {
      const s = p.avgScoreNative;
      const ok = s != null && Number.isFinite(s);
      return {
        date: p.date,
        score: ok ? s : hourly ? 0 : null
      };
    });
  }
  return pts.map((p) => {
    const s = p.avgScoreNorm5;
    const ok = s != null && Number.isFinite(s);
    return {
      date: p.date,
      score: ok ? s : hourly ? 0 : null
    };
  });
}

export function computeSurveyScoreYDomain(
  points: ServicesSurveyScorePoint[] | undefined,
  mode: string | undefined,
  granularity: string | undefined
): [number, number] {
  const pts = points ?? [];
  const hourly = granularity === 'hour';
  if (mode !== 'questions') {
    return hourly ? [0, 5] : [1, 5];
  }
  let scaleLo: number | undefined;
  let scaleHi: number | undefined;
  for (const p of pts) {
    if (p.scaleMin != null) scaleLo = p.scaleMin;
    if (p.scaleMax != null) scaleHi = p.scaleMax;
    if (scaleLo != null && scaleHi != null) break;
  }
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const p of pts) {
    if (p.avgScoreNative != null && Number.isFinite(p.avgScoreNative)) {
      vmin = Math.min(vmin, p.avgScoreNative);
      vmax = Math.max(vmax, p.avgScoreNative);
    }
  }
  const lo = scaleLo ?? (Number.isFinite(vmin) ? vmin : 0);
  const hi = scaleHi ?? (Number.isFinite(vmax) ? vmax : 5);
  const span = hi - lo;
  const pad =
    span > 0 ? span * 0.05 : Math.max(0.5, Math.abs(lo || hi) * 0.1 || 0.5);
  let y0 = lo - pad;
  const y1 = hi + pad;
  if (hourly) {
    y0 = Math.min(y0, 0);
  }
  return [y0, y1];
}
