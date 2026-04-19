'use client';

import { useQuery } from '@tanstack/react-query';
import { unitsApi } from '@/lib/api';
import { isUnitSelectableInSidebar } from '@/lib/unit-sidebar';

export type TenantSystemAdminCompanyUnitsSnapshot = {
  /** Subdivision unit ids in the company (sidebar / assignable); excludes service_zone. */
  allIds: string[];
  /** Top-level subdivisions for workstation seeds; excludes service_zone roots. */
  rootIds: string[];
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
      return { allIds, rootIds };
    },
    enabled: enabled && !!cid,
    staleTime: 60_000
  });
}
