/**
 * Sidebar / org switcher lists operational subdivisions only — not service_zone groupings.
 * Missing kind is treated like subdivision (legacy rows).
 */
export function isUnitSelectableInSidebar(
  kind: string | null | undefined
): boolean {
  return (kind ?? 'subdivision') !== 'service_zone';
}
