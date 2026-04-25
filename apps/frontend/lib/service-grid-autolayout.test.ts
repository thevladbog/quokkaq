import { describe, expect, it } from 'vitest';

import type { Service } from '@quokkaq/shared-types';

import {
  buildAutolayoutPageSlots,
  clampAutolayoutPageIndex,
  getAutolayoutGridDimensions,
  getAutolayoutPageCount,
  getAutolayoutPageSlice,
  KIOSK_AUTOLAYOUT_PAGE_THRESHOLD,
  sortServicesForKioskAutolayout
} from './service-grid-autolayout';

function s(id: string, name: string, order?: number): Service {
  return {
    id,
    unitId: 'u1',
    name,
    ...(order !== undefined ? { sortOrder: order } : {})
  } as Service;
}

describe('getAutolayoutPageCount', () => {
  it('returns 0 for empty', () => {
    expect(getAutolayoutPageCount(0)).toBe(0);
  });

  it('returns 1 for 1..12', () => {
    expect(getAutolayoutPageCount(1)).toBe(1);
    expect(getAutolayoutPageCount(12)).toBe(1);
  });

  it('paginates after 12 (ceil(n/9))', () => {
    expect(getAutolayoutPageCount(13)).toBe(2);
    expect(getAutolayoutPageCount(18)).toBe(2);
    expect(getAutolayoutPageCount(19)).toBe(3);
  });
});

describe('getAutolayoutGridDimensions', () => {
  it('1–12: table dimensions', () => {
    expect(getAutolayoutGridDimensions(1, 1)).toEqual({ rows: 1, cols: 1 });
    expect(getAutolayoutGridDimensions(2, 2)).toEqual({ rows: 1, cols: 2 });
    expect(getAutolayoutGridDimensions(3, 3)).toEqual({ rows: 2, cols: 2 });
    expect(getAutolayoutGridDimensions(4, 4)).toEqual({ rows: 2, cols: 2 });
    expect(getAutolayoutGridDimensions(5, 5)).toEqual({ rows: 2, cols: 3 });
    expect(getAutolayoutGridDimensions(9, 9)).toEqual({ rows: 3, cols: 3 });
    expect(getAutolayoutGridDimensions(12, 12)).toEqual({ rows: 4, cols: 3 });
  });

  it('13+ at level: always 3x3 for every page', () => {
    expect(getAutolayoutGridDimensions(9, 20)).toEqual({ rows: 3, cols: 3 });
    expect(getAutolayoutGridDimensions(1, 13)).toEqual({ rows: 3, cols: 3 });
  });
});

describe('getAutolayoutPageSlice', () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    s(`id${i + 1}`, `S${i + 1}`, i)
  );
  it('returns full list when n ≤ 12', () => {
    const t = many.slice(0, 5);
    expect(getAutolayoutPageSlice(t, 99).map((x) => x.id)).toEqual(
      t.map((x) => x.id)
    );
  });
  it('slices 9 on second page of 20', () => {
    const sel = getAutolayoutPageSlice(many, 1).map((x) => x.id);
    expect(sel).toHaveLength(9);
    expect(sel[0]).toBe('id10');
  });
});

describe('buildAutolayoutPageSlots', () => {
  it('3 in 2×2 has one empty', () => {
    const a = s('1', 'a');
    const b = s('2', 'b');
    const c = s('3', 'c');
    const sl = buildAutolayoutPageSlots([a, b, c], 3);
    expect(sl).toHaveLength(4);
    const emp = sl.filter((x) => x.type === 'empty');
    expect(emp).toHaveLength(1);
  });
});

describe('sortServicesForKioskAutolayout', () => {
  it('orders by sortOrder', () => {
    const out = sortServicesForKioskAutolayout([
      s('b', 'B', 2),
      s('a', 'A', 1)
    ]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('ties on name and id', () => {
    const out = sortServicesForKioskAutolayout([
      s('z', 'Same'),
      s('a', 'Same')
    ]);
    expect(out.map((x) => x.id)).toEqual(['a', 'z']);
  });
});

describe('clampAutolayoutPageIndex', () => {
  it('clamps to last page for out-of-range', () => {
    const total = 18;
    expect(clampAutolayoutPageIndex(0, total)).toBe(0);
    expect(clampAutolayoutPageIndex(1, total)).toBe(1);
    expect(clampAutolayoutPageIndex(5, total)).toBe(1);
  });
});

describe('KIOSK_AUTOLAYOUT_PAGE_THRESHOLD', () => {
  it('stays 12 to match the design spec', () => {
    expect(KIOSK_AUTOLAYOUT_PAGE_THRESHOLD).toBe(12);
  });
});
