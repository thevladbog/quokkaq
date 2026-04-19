import { describe, expect, it } from 'vitest';
import {
  childSubdivisionsQueryKey,
  childUnitsQueryKey
} from '@/components/admin/units/unit-child-query-keys';
import {
  getGetUnitByIDQueryKey,
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

  it('getGetUnitByIDQueryKey matches path used by unit detail queries', () => {
    expect(getGetUnitByIDQueryKey('unit-xyz')).toEqual(['/units/unit-xyz']);
  });
});
