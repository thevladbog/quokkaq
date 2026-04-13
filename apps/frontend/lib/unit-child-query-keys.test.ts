import { describe, expect, it } from 'vitest';
import {
  childSubdivisionsQueryKey,
  childUnitsQueryKey
} from '@/components/admin/units/unit-child-query-keys';
import {
  getGetUnitsUnitIdChildUnitsQueryKey,
  getGetUnitsUnitIdChildWorkplacesQueryKey
} from '@/lib/api/generated/units';

describe('unit-child-query-keys', () => {
  it('matches Orval-generated keys for child units and child workplaces', () => {
    const id = 'unit-abc';
    expect(childUnitsQueryKey(id)).toEqual(
      getGetUnitsUnitIdChildUnitsQueryKey(id)
    );
    expect(childSubdivisionsQueryKey(id)).toEqual(
      getGetUnitsUnitIdChildWorkplacesQueryKey(id)
    );
  });
});
