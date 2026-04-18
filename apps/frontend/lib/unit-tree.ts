import type { Unit } from '@quokkaq/shared-types';

export type UnitTreeNode = {
  unit: Unit;
  children: UnitTreeNode[];
};

function sortUnitsByName(a: Unit, b: Unit): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Full company/unit list: roots are units with no parent or parent missing from the list.
 */
export function buildUnitForest(units: Unit[]): UnitTreeNode[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const childrenOf = new Map<string, Unit[]>();

  for (const u of units) {
    const p = u.parentId;
    if (!p || !byId.has(p)) continue;
    const list = childrenOf.get(p) ?? [];
    list.push(u);
    childrenOf.set(p, list);
  }
  for (const [, list] of childrenOf) {
    list.sort(sortUnitsByName);
  }

  const roots = units
    .filter((u) => !u.parentId || !byId.has(u.parentId))
    .sort(sortUnitsByName);

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
  units: Unit[]
): UnitTreeNode[] {
  const subtreeIds = new Set<string>();

  function collectDescendants(id: string) {
    for (const u of units) {
      if (u.parentId === id) {
        subtreeIds.add(u.id);
        collectDescendants(u.id);
      }
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
  for (const [, list] of childrenOf) {
    list.sort(sortUnitsByName);
  }

  const roots = subtreeUnits
    .filter((u) => u.parentId === rootId)
    .sort(sortUnitsByName);

  function walk(u: Unit): UnitTreeNode {
    return {
      unit: u,
      children: (childrenOf.get(u.id) ?? []).map(walk)
    };
  }

  return roots.map(walk);
}
