import type { Service, Unit } from '@quokkaq/shared-types';

const unitKey = (id: string) => `qq.kiosk.snapshot.unit.${id}`;
const treeKey = (id: string) => `qq.kiosk.snapshot.tree.${id}`;

/** Best-effort read cache for 5.5: shown when the API is temporarily unreachable after at least one successful load. */
export function readCachedKioskUnit(unitId: string): Unit | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const s = localStorage.getItem(unitKey(unitId));
    if (!s) {
      return null;
    }
    const o = JSON.parse(s) as { unit?: Unit; at?: number };
    if (!o?.unit?.id) {
      return null;
    }
    return o.unit;
  } catch {
    return null;
  }
}

export function readCachedKioskServiceTree(unitId: string): Service[] | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const s = localStorage.getItem(treeKey(unitId));
    if (!s) {
      return null;
    }
    const o = JSON.parse(s) as { services?: Service[]; at?: number };
    if (!o?.services || !Array.isArray(o.services)) {
      return null;
    }
    return o.services;
  } catch {
    return null;
  }
}

export function persistKioskUnitSnapshot(unitId: string, unit: Unit) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(
      unitKey(unitId),
      JSON.stringify({ at: Date.now(), unit })
    );
  } catch {
    // quota / private mode
  }
}

export function persistKioskServiceTreeSnapshot(
  unitId: string,
  services: Service[]
) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(
      treeKey(unitId),
      JSON.stringify({ at: Date.now(), services })
    );
  } catch {
    // ignore
  }
}
