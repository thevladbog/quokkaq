import type { Counter, Unit } from '@/lib/api';

/** Counters shown in desktop terminal pairing UI for a subdivision or service zone unit. */
export function filterCountersForContext(
  unit: Unit,
  counters: Counter[]
): Counter[] {
  if (unit.kind === 'subdivision') {
    return counters.filter((c) => c.unitId === unit.id);
  }
  if (unit.kind === 'service_zone') {
    return counters.filter(
      (c) =>
        !c.serviceZoneId ||
        String(c.serviceZoneId).trim() === '' ||
        c.serviceZoneId === unit.id
    );
  }
  return [];
}
