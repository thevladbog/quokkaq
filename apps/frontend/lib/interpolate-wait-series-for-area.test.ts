import { describe, expect, it } from 'vitest';

import { interpolateWaitSeriesForArea } from '@/lib/interpolate-wait-series-for-area';

describe('interpolateWaitSeriesForArea', () => {
  it('interpolates nulls between first and last known values', () => {
    const v = [null, 10, null, 30, null] as (number | null)[];
    const out = interpolateWaitSeriesForArea(v);
    expect(out[0]).toBeNull();
    expect(out[1]).toBe(10);
    expect(out[2]).toBe(20);
    expect(out[3]).toBe(30);
    expect(out[4]).toBeNull();
  });

  it('widens a single point to three hours when possible', () => {
    const v = Array(5).fill(null) as (number | null)[];
    v[2] = 5;
    const out = interpolateWaitSeriesForArea(v);
    expect(out[1]).toBe(5);
    expect(out[2]).toBe(5);
    expect(out[3]).toBe(5);
  });
});
