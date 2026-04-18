import type { Unit } from '@quokkaq/shared-types';

import { getUnitDisplayName } from '@/lib/unit-display';

export type UnitTreeNode = {
  unit: Unit;
  children: UnitTreeNode[];
};

const DEFAULT_LOCALE = 'en';

function sortUnitsByDisplayName(locale: string) {
  return (a: Unit, b: Unit): number =>
    getUnitDisplayName(a, locale).localeCompare(
      getUnitDisplayName(b, locale),
      undefined,
      { sensitivity: 'base' }
    );
}

/** Parent id → direct children (only edges where parent exists in `units`). */
function buildChildrenOfMap(units: Unit[]): Map<string, Unit[]> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const childrenOf = new Map<string, Unit[]>();
  for (const u of units) {
    const p = u.parentId;
    if (!p || !byId.has(p)) continue;
    const list = childrenOf.get(p) ?? [];
    list.push(u);
    childrenOf.set(p, list);
  }
  return childrenOf;
}

/**
 * Full company/unit list: roots are units with no parent or parent missing from the list.
 */
export function buildUnitForest(
  units: Unit[],
  locale: string = DEFAULT_LOCALE
): UnitTreeNode[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const childrenOf = buildChildrenOfMap(units);
  const cmp = sortUnitsByDisplayName(locale);
  for (const [, list] of childrenOf) {
    list.sort(cmp);
  }

  const roots = units
    .filter((u) => !u.parentId || !byId.has(u.parentId))
    .sort(cmp);

  function walk(u: Unit): UnitTreeNode {
    return {
      unit: u,
      children: (childrenOf.get(u.id) ?? []).map(walk)
    };
  }

  return roots.map(walk);
}

/**
 * Only descendants of `rootId` (not including `rootId`), nested under their immediate parents.
 */
export function buildDescendantForest(
  rootId: string,
  units: Unit[],
  locale: string = DEFAULT_LOCALE
): UnitTreeNode[] {
  const childrenOfFull = buildChildrenOfMap(units);
  const subtreeIds = new Set<string>();

  function collectDescendants(id: string) {
    for (const child of childrenOfFull.get(id) ?? []) {
      if (subtreeIds.has(child.id)) {
        continue;
      }
      subtreeIds.add(child.id);
      collectDescendants(child.id);
    }
  }
  collectDescendants(rootId);

  const subtreeUnits = units.filter((u) => subtreeIds.has(u.id));
  const subtreeById = new Map(subtreeUnits.map((u) => [u.id, u]));
  const childrenOf = new Map<string, Unit[]>();

  for (const u of subtreeUnits) {
    const p = u.parentId;
    if (!p || !subtreeById.has(p)) continue;
    const list = childrenOf.get(p) ?? [];
    list.push(u);
    childrenOf.set(p, list);
  }
  const cmp = sortUnitsByDisplayName(locale);
  for (const [, list] of childrenOf) {
    list.sort(cmp);
  }

  const roots = subtreeUnits.filter((u) => u.parentId === rootId).sort(cmp);

  function walk(u: Unit): UnitTreeNode {
    return {
      unit: u,
      children: (childrenOf.get(u.id) ?? []).map(walk)
    };
  }

  return roots.map(walk);
}
