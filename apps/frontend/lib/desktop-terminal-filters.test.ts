import { describe, expect, it } from 'vitest';
import type { Counter, Unit } from '@/lib/api';
import { filterCountersForContext } from './desktop-terminal-filters';

function unit(partial: Pick<Unit, 'id' | 'kind'> & Partial<Unit>): Unit {
  return partial as Unit;
}

function counter(
  partial: Pick<Counter, 'id' | 'unitId'> & Partial<Counter>
): Counter {
  return partial as Counter;
}

describe('filterCountersForContext', () => {
  it('subdivision: only counters for that unit id', () => {
    const u = unit({ id: 'sub-1', kind: 'subdivision' });
    const rows = [
      counter({ id: 'c1', unitId: 'sub-1' }),
      counter({ id: 'c2', unitId: 'other' })
    ];
    expect(filterCountersForContext(u, rows)).toEqual([rows[0]]);
  });

  it('service_zone: counter with matching zone or empty zone', () => {
    const zone = unit({ id: 'zone-1', kind: 'service_zone' });
    const rows = [
      counter({ id: 'a', unitId: 'queue', serviceZoneId: 'zone-1' }),
      counter({ id: 'b', unitId: 'queue', serviceZoneId: 'other' }),
      counter({ id: 'c', unitId: 'queue' }),
      counter({ id: 'd', unitId: 'queue', serviceZoneId: '   ' })
    ];
    const got = filterCountersForContext(zone, rows);
    expect(got.map((c) => c.id).sort()).toEqual(['a', 'c', 'd']);
  });

  it('returns empty for unit kinds other than subdivision or service_zone', () => {
    const u = { id: 'x', kind: 'branch' } as Unit;
    expect(
      filterCountersForContext(u, [counter({ id: 'c', unitId: 'x' })])
    ).toEqual([]);
  });
});
