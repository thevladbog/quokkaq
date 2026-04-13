import {
  getGetUnitsUnitIdChildUnitsQueryKey,
  getGetUnitsUnitIdChildWorkplacesQueryKey
} from '@/lib/api/generated/units';

/** Shared React Query keys for admin unit hierarchy (child units / workplaces). */

export const childUnitsQueryKey = (parentId: string) =>
  getGetUnitsUnitIdChildUnitsQueryKey(parentId);

/** Matches GET /units/:id/child-workplaces (child subdivisions). */
export const childSubdivisionsQueryKey = (parentId: string) =>
  getGetUnitsUnitIdChildWorkplacesQueryKey(parentId);
