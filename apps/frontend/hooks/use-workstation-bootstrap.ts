'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ApiHttpError,
  countersApi,
  unitsApi,
  type Counter,
  type Unit
} from '@/lib/api';
import { logger } from '@/lib/logger';
import { useRouter } from '@/src/i18n/navigation';

/** Max parent hops when resolving unit hierarchy (ancestors + zone walk). */
const MAX_ANCESTOR_DEPTH = 20;

export type WorkstationRow = {
  counter: Counter;
  workplaceUnit: Unit;
  zoneFilterKey: string;
  zoneLabel: string;
};

async function fetchUnitOrNull(id: string): Promise<Unit | null> {
  try {
    return await unitsApi.getById(id);
  } catch (e) {
    if (e instanceof ApiHttpError && e.status === 404) {
      return null;
    }
    throw e;
  }
}

/**
 * Counters attach to subdivision (workplace) rows, not to service_zone rows.
 * Walk the org tree with `getChildUnits`:
 * - **service_zone**: recurse into children (counters are never on the zone row).
 * - **subdivision**: if it has children, recurse first (counters are often on leaf subdivisions
 *   under nested zones); then include this unit too (parent may host counters directly).
 */
async function expandSeedUnitsForCounters(
  seedUnitIds: string[]
): Promise<string[]> {
  const result: string[] = [];
  const visited = new Set<string>();

  async function expandOne(id: string, depth: number): Promise<void> {
    const trimmed = id?.trim();
    if (!trimmed || visited.has(trimmed)) return;
    if (depth > MAX_ANCESTOR_DEPTH) {
      // Do not drop deep leaves: still query counters on this unit id.
      result.push(trimmed);
      return;
    }
    visited.add(trimmed);

    const u = await fetchUnitOrNull(trimmed);
    if (!u) {
      result.push(trimmed);
      return;
    }

    let children: Unit[] = [];
    try {
      children = await unitsApi.getChildUnits(trimmed);
    } catch {
      result.push(trimmed);
      return;
    }

    const kind = u.kind ?? 'subdivision';

    if (kind === 'service_zone') {
      if (children.length === 0) {
        result.push(trimmed);
        return;
      }
      await Promise.all(children.map((c) => expandOne(c.id, depth + 1)));
      return;
    }

    // subdivision (default): descend so we pick up workplaces under nested service zones / branches.
    if (children.length === 0) {
      result.push(trimmed);
      return;
    }
    await Promise.all(children.map((c) => expandOne(c.id, depth + 1)));
    result.push(trimmed);
  }

  const uniq = [
    ...new Set(seedUnitIds.map((id) => id?.trim()).filter(Boolean))
  ];
  for (const id of uniq) {
    await expandOne(id, 0);
  }
  // Always include seed ids so we still query counters if expansion missed a branch.
  return [...new Set([...uniq, ...result])];
}

async function loadUnitsWithAncestors(
  seedIds: string[]
): Promise<Map<string, Unit>> {
  const map = new Map<string, Unit>();
  let pending = [...new Set(seedIds.filter(Boolean))];
  let guard = 0;
  while (pending.length > 0 && guard < 20) {
    guard += 1;
    const batch = pending.filter((id) => !map.has(id));
    pending = [];
    if (batch.length === 0) break;
    const results = await Promise.all(batch.map((id) => fetchUnitOrNull(id)));
    for (const u of results) {
      if (!u) continue;
      map.set(u.id, u);
      if (u.parentId && !map.has(u.parentId)) {
        pending.push(u.parentId);
      }
    }
  }
  return map;
}

/** Load units referenced by id (e.g. counter.serviceZoneId) and their parent chain into the map. */
async function enrichMapWithUnitIds(
  map: Map<string, Unit>,
  ids: string[]
): Promise<void> {
  const unique = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
  for (const id of unique) {
    if (map.has(id)) continue;
    const u = await fetchUnitOrNull(id);
    if (!u) continue;
    map.set(u.id, u);
    let p = u.parentId;
    let steps = 0;
    while (p && !map.has(p) && steps < MAX_ANCESTOR_DEPTH) {
      steps += 1;
      const pu = await fetchUnitOrNull(p);
      if (!pu) break;
      map.set(pu.id, pu);
      p = pu.parentId;
    }
  }
}

/** Fallback when the counter’s unit is not itself a service_zone: walk up to the nearest zone, else use workplace name (subdivision-wide pool). */
function resolveZoneFromWorkplaceUnit(
  workplaceUnit: Unit,
  unitsById: Map<string, Unit>
): { zoneFilterKey: string; zoneLabel: string } {
  let current: Unit | undefined = workplaceUnit;
  let steps = 0;
  while (current && steps < MAX_ANCESTOR_DEPTH) {
    steps += 1;
    if (current.kind === 'service_zone') {
      return { zoneFilterKey: `sz:${current.id}`, zoneLabel: current.name };
    }
    if (!current.parentId) break;
    current = unitsById.get(current.parentId);
  }
  return {
    zoneFilterKey: `u:${workplaceUnit.id}`,
    zoneLabel: workplaceUnit.name
  };
}

/**
 * Queue pool shown in the directory: prefer explicit `counter.serviceZoneId` (counter on subdivision
 * but tied to a zone); otherwise infer from unit hierarchy (counter placed on a zone unit).
 */
function resolveWorkstationZone(
  counter: Counter,
  workplaceUnit: Unit,
  unitsById: Map<string, Unit>,
  unknownZoneLabel: string
): { zoneFilterKey: string; zoneLabel: string } {
  const sz = counter.serviceZoneId?.trim();
  if (sz) {
    const zoneUnit = unitsById.get(sz);
    if (zoneUnit) {
      return { zoneFilterKey: `sz:${sz}`, zoneLabel: zoneUnit.name };
    }
    return { zoneFilterKey: `sz:${sz}`, zoneLabel: unknownZoneLabel };
  }
  return resolveZoneFromWorkplaceUnit(workplaceUnit, unitsById);
}

type WorkstationBootstrapResult =
  | { kind: 'rows'; rows: WorkstationRow[] }
  | { kind: 'redirect'; unitId: string; counterId: string };

async function fetchWorkstationBootstrap(
  userId: string,
  seedUnitIds: string[],
  unknownZoneLabel: string
): Promise<WorkstationBootstrapResult> {
  const expandedUnitIds = await expandSeedUnitsForCounters(seedUnitIds);

  const unitsById = await loadUnitsWithAncestors(expandedUnitIds);

  const settled = await Promise.allSettled(
    expandedUnitIds.map((unitId) => countersApi.getByUnitId(unitId))
  );
  const flat: Counter[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      flat.push(...r.value);
    } else {
      logger.warn(
        'Failed to load counters for unit',
        expandedUnitIds[i],
        r.reason
      );
    }
  }

  const mine = flat.find((c) => c.assignedTo === userId);
  if (mine) {
    return {
      kind: 'redirect',
      unitId: mine.unitId,
      counterId: mine.id
    };
  }

  const counterUnitIds = flat.map((c) => c.unitId).filter(Boolean);
  const zoneRefIds = flat
    .map((c) => c.serviceZoneId?.trim())
    .filter((id): id is string => Boolean(id));
  await enrichMapWithUnitIds(unitsById, [...counterUnitIds, ...zoneRefIds]);

  const built: WorkstationRow[] = [];
  for (const counter of flat) {
    const workplaceUnit = unitsById.get(counter.unitId);
    if (!workplaceUnit) {
      logger.warn(
        'Workstation bootstrap: counter unit not in map',
        counter.id,
        counter.unitId
      );
      continue;
    }
    const { zoneFilterKey, zoneLabel } = resolveWorkstationZone(
      counter,
      workplaceUnit,
      unitsById,
      unknownZoneLabel
    );
    built.push({ counter, workplaceUnit, zoneFilterKey, zoneLabel });
  }

  return { kind: 'rows', rows: built };
}

export function useWorkstationBootstrap({
  authLoading,
  userId,
  seedUnitIds,
  hasUser
}: {
  authLoading: boolean;
  userId: string | undefined;
  seedUnitIds: string[];
  hasUser: boolean;
}) {
  const router = useRouter();
  const t = useTranslations('staff.directory');

  const enabled = !authLoading && hasUser && !!userId && seedUnitIds.length > 0;

  const unknownZoneLabel = t('unknownServiceZone');

  const query = useQuery({
    queryKey: [
      'staff-workstation-bootstrap',
      userId,
      seedUnitIds,
      unknownZoneLabel
    ] as const,
    queryFn: () =>
      fetchWorkstationBootstrap(userId!, seedUnitIds, unknownZoneLabel),
    enabled,
    retry(failureCount, error) {
      if (failureCount >= 2) return false;
      if (
        error instanceof ApiHttpError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return false;
      }
      return true;
    }
  });

  useEffect(() => {
    if (query.data?.kind !== 'redirect') return;
    // Stale cache can still say "redirect" while counters refetch after release; do not bounce back to the workstation.
    if (query.isFetching) return;
    router.replace(`/staff/${query.data.unitId}/${query.data.counterId}`);
  }, [query.data, query.isFetching, router]);

  const loadErrorToastShown = useRef(false);
  useEffect(() => {
    if (!query.isError) {
      loadErrorToastShown.current = false;
      return;
    }
    if (loadErrorToastShown.current) return;
    loadErrorToastShown.current = true;
    logger.error('Failed to load workstation directory', query.error);
    toast.error(t('loadError'));
  }, [query.isError, query.error, t]);

  const rows = query.data?.kind === 'rows' ? query.data.rows : [];
  const isLoading =
    authLoading ||
    query.data?.kind === 'redirect' ||
    (enabled && query.isPending);

  return { rows, isLoading, error: query.error, isError: query.isError };
}
