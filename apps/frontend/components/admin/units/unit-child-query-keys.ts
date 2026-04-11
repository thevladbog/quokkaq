/** Shared React Query keys for admin unit hierarchy (child units / workplaces). */

export const childUnitsQueryKey = (parentId: string) =>
  ['unit-child-units', parentId] as const;

/** Matches GET /units/:id/child-workplaces (child subdivisions). */
export const childSubdivisionsQueryKey = (parentId: string) =>
  ['unit-child-workplaces', parentId] as const;
