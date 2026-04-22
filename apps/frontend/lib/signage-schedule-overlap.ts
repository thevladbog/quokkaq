/** Mon..Sun, same as schedule UI */
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 7] as const;

function parseTimeToMin(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) {
    return null;
  }
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

export function parseScheduleDays(set: string): Set<number> {
  const out = new Set<number>();
  for (const p of set.split(/[\s,]+/)) {
    if (!p) {
      continue;
    }
    const n = parseInt(p, 10);
    if (n >= 1 && n <= 7) {
      out.add(n);
    }
  }
  return out;
}

/**
 * Intervals in minutes; half-open [start, end) — if end <= start, not treated as overlap.
 */
export function timeIntervalsOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number
): boolean {
  if (a1 <= a0 || b1 <= b0) {
    return false;
  }
  return a0 < b1 && b0 < a1;
}

export type OverlapCheckRow = {
  id: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
};

/**
 * Ids of schedules that overlap another on at least one common weekday.
 */
export function getOverlappingScheduleIds(
  rows: OverlapCheckRow[]
): Set<string> {
  const byDay = new Map<number, OverlapCheckRow[]>();
  for (const d of DAY_INDEX) {
    byDay.set(d, []);
  }
  for (const s of rows) {
    for (const d of parseScheduleDays(s.daysOfWeek)) {
      const list = byDay.get(d);
      if (list) {
        list.push(s);
      }
    }
  }
  const out = new Set<string>();
  for (const d of DAY_INDEX) {
    const list = byDay.get(d) ?? [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i]!;
        const B = list[j]!;
        const a0 = parseTimeToMin(A.startTime);
        const a1 = parseTimeToMin(A.endTime);
        const b0 = parseTimeToMin(B.startTime);
        const b1 = parseTimeToMin(B.endTime);
        if (a0 == null || a1 == null || b0 == null || b1 == null) {
          continue;
        }
        if (timeIntervalsOverlap(a0, a1, b0, b1)) {
          out.add(A.id);
          out.add(B.id);
        }
      }
    }
  }
  return out;
}

function pairOverlaps(
  a: { daysOfWeek: string; startTime: string; endTime: string },
  b: { daysOfWeek: string; startTime: string; endTime: string }
): boolean {
  const da = parseScheduleDays(a.daysOfWeek);
  const db = parseScheduleDays(b.daysOfWeek);
  for (const d of da) {
    if (!db.has(d)) {
      continue;
    }
    const a0 = parseTimeToMin(a.startTime);
    const a1 = parseTimeToMin(a.endTime);
    const b0 = parseTimeToMin(b.startTime);
    const b1 = parseTimeToMin(b.endTime);
    if (a0 == null || a1 == null || b0 == null || b1 == null) {
      continue;
    }
    if (timeIntervalsOverlap(a0, a1, b0, b1)) {
      return true;
    }
  }
  return false;
}

/**
 * True if the new window overlaps time on a shared day with any existing row.
 */
export function newScheduleOverlapsAnyExisting(
  candidate: {
    daysOfWeek: string;
    startTime: string;
    endTime: string;
  },
  existing: Array<{
    daysOfWeek?: string;
    startTime?: string;
    endTime?: string;
  }>
): boolean {
  for (const e of existing) {
    if (
      pairOverlaps(
        { ...candidate },
        {
          daysOfWeek: e.daysOfWeek ?? '',
          startTime: e.startTime ?? '',
          endTime: e.endTime ?? ''
        }
      )
    ) {
      return true;
    }
  }
  return false;
}
