/**
 * Resolves `?unit=` deep-link filter: only accept IDs that exist in the current unit list.
 */
export function resolveUnitFilterFromQuery(
  unitQuery: string | null,
  validUnitIds: readonly string[]
): string | null {
  if (!unitQuery) {
    return null;
  }
  return validUnitIds.includes(unitQuery) ? unitQuery : null;
}
