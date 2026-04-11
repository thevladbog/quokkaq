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

function resolveZone(
  workplaceUnit: Unit,
  unitsById: Map<string, Unit>
): { zoneFilterKey: string; zoneLabel: string } {
  let current: Unit | undefined = workplaceUnit;
  let steps = 0;
  while (current && steps < 20) {
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

type WorkstationBootstrapResult =
  | { kind: 'rows'; rows: WorkstationRow[] }
  | { kind: 'redirect'; unitId: string; counterId: string };

async function fetchWorkstationBootstrap(
  userId: string,
  seedUnitIds: string[]
): Promise<WorkstationBootstrapResult> {
  const unitsById = await loadUnitsWithAncestors(seedUnitIds);

  const counterLists = await Promise.all(
    seedUnitIds.map((unitId) => countersApi.getByUnitId(unitId))
  );

  const flat = counterLists.flat();
  const mine = flat.find((c) => c.assignedTo === userId);
  if (mine) {
    return {
      kind: 'redirect',
      unitId: mine.unitId,
      counterId: mine.id
    };
  }

  const built: WorkstationRow[] = [];
  for (const counter of flat) {
    const workplaceUnit = unitsById.get(counter.unitId);
    if (!workplaceUnit) continue;
    const { zoneFilterKey, zoneLabel } = resolveZone(workplaceUnit, unitsById);
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

  const query = useQuery({
    queryKey: ['staff-workstation-bootstrap', userId, seedUnitIds] as const,
    queryFn: () => fetchWorkstationBootstrap(userId!, seedUnitIds),
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
    router.replace(`/staff/${query.data.unitId}/${query.data.counterId}`);
  }, [query.data, router]);

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
