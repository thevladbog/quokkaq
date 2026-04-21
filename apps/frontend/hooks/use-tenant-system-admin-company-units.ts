'use client';

import { useQuery } from '@tanstack/react-query';
import { unitsApi } from '@/lib/api';
import { isUnitSelectableInSidebar } from '@/lib/unit-sidebar';

export type TenantSystemAdminCompanyUnitsSnapshot = {
  /** Subdivision unit ids in the company (sidebar / assignable); excludes service_zone. */
  allIds: string[];
  /** Top-level subdivisions for workstation seeds; excludes service_zone roots. */
  rootIds: string[];
  /** Display label per unit id from the same `getAll` payload (avoids N× GET /units/:id for labels). */
  labelById: Record<string, string>;
};

/**
 * Loads all units for a company when the tenant system administrator has no user_units
 * in GET /auth/me (or no rows for the active company in the sidebar).
 * GET /units is unauthenticated on the API today; we filter client-side by companyId.
 */
export function useTenantSystemAdminCompanyUnitSnapshot(
  activeCompanyId: string | null | undefined,
  enabled: boolean
) {
  const cid = activeCompanyId?.trim() ?? '';
  return useQuery({
    queryKey: ['tenant-system-admin-company-units', cid],
    queryFn: async (): Promise<TenantSystemAdminCompanyUnitsSnapshot> => {
      const all = await unitsApi.getAll();
      const inCo = all.filter(
        (u) => u.companyId === cid && isUnitSelectableInSidebar(u.kind)
      );
      const allIds = [...new Set(inCo.map((u) => u.id))];
      const roots = inCo.filter((u) => !u.parentId?.trim()).map((u) => u.id);
      const rootIds = roots.length > 0 ? roots : allIds;
      const labelById: Record<string, string> = {};
      for (const u of inCo) {
        const id = u.id?.trim();
        if (!id) continue;
        const label = u.name?.trim() || u.code?.trim();
        if (label) labelById[id] = label;
      }
      return { allIds, rootIds, labelById };
    },
    enabled: enabled && !!cid,
    staleTime: 60_000
  });
}
