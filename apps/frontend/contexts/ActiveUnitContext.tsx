'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveCompany } from '@/contexts/ActiveCompanyContext';
import { useTenantSystemAdminCompanyUnitSnapshot } from '@/hooks/use-tenant-system-admin-company-units';
import { isTenantSystemAdminSlug } from '@/lib/tenant-roles';
import { isUnitSelectableInSidebar } from '@/lib/unit-sidebar';

const STORAGE_PREFIX = 'quokkaq.activeUnit.';

type ActiveUnitContextValue = {
  activeUnitId: string | null;
  setActiveUnitId: (id: string) => void;
  assignableUnitIds: string[];
};

const ActiveUnitContext = createContext<ActiveUnitContextValue | undefined>(
  undefined
);

export function ActiveUnitProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuthContext();
  const { activeCompanyId } = useActiveCompany();
  const [preference, setPreference] = useState<string | null>(null);

  const assignableUnitIdsFromProfile = useMemo(() => {
    const units = user?.units;
    if (!units?.length) return [];
    const cid = activeCompanyId?.trim();
    const filtered = !cid
      ? units
      : units.filter((u: { companyId?: string }) => u.companyId === cid);
    const ids = filtered
      .filter((u: { unit?: { kind?: string } | null }) =>
        isUnitSelectableInSidebar(u.unit?.kind)
      )
      .map((u: { unitId: string }) => u.unitId);
    // user.units can list the same unit more than once (e.g. multiple roles); keys must be unique.
    return [...new Set(ids)];
  }, [user?.units, activeCompanyId]);

  const sidebarNeedsTenantAdminSnapshot =
    (user?.tenantRoles?.some((r) => isTenantSystemAdminSlug(r.slug)) ??
      false) &&
    !!activeCompanyId?.trim() &&
    assignableUnitIdsFromProfile.length === 0;

  const { data: tenantAdminSnapshot } = useTenantSystemAdminCompanyUnitSnapshot(
    activeCompanyId,
    sidebarNeedsTenantAdminSnapshot
  );

  const assignableUnitIds = useMemo(() => {
    if (assignableUnitIdsFromProfile.length > 0) {
      return assignableUnitIdsFromProfile;
    }
    if (
      sidebarNeedsTenantAdminSnapshot &&
      tenantAdminSnapshot?.allIds?.length
    ) {
      return tenantAdminSnapshot.allIds;
    }
    return [];
  }, [
    assignableUnitIdsFromProfile,
    sidebarNeedsTenantAdminSnapshot,
    tenantAdminSnapshot?.allIds
  ]);

  const userId = user?.id;

  const activeUnitId = useMemo(() => {
    if (!isAuthenticated || !userId) return null;
    if (assignableUnitIds.length === 0) return null;

    const stored =
      typeof window !== 'undefined'
        ? localStorage.getItem(STORAGE_PREFIX + userId)
        : null;

    const pick = (c: string | null | undefined) =>
      c && assignableUnitIds.includes(c) ? c : null;

    return pick(preference) ?? pick(stored) ?? assignableUnitIds[0] ?? null;
  }, [isAuthenticated, userId, assignableUnitIds, preference]);

  const setActiveUnitId = useCallback(
    (id: string) => {
      if (!user?.id) return;
      if (!assignableUnitIds.includes(id)) return;
      setPreference(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_PREFIX + user.id, id);
      }
    },
    [user, assignableUnitIds]
  );

  const value = useMemo(
    () => ({
      activeUnitId,
      setActiveUnitId,
      assignableUnitIds
    }),
    [activeUnitId, setActiveUnitId, assignableUnitIds]
  );

  return (
    <ActiveUnitContext.Provider value={value}>
      {children}
    </ActiveUnitContext.Provider>
  );
}

export function useActiveUnit(): ActiveUnitContextValue {
  const ctx = useContext(ActiveUnitContext);
  if (!ctx) {
    throw new Error('useActiveUnit must be used within ActiveUnitProvider');
  }
  return ctx;
}

/** When the route unit is assignable, align the sidebar / persisted active unit with it. */
export function useSyncActiveUnit(unitId: string): void {
  const { setActiveUnitId, assignableUnitIds } = useActiveUnit();

  useEffect(() => {
    if (assignableUnitIds.includes(unitId)) {
      setActiveUnitId(unitId);
    }
  }, [unitId, assignableUnitIds, setActiveUnitId]);
}
