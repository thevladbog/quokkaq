'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useAuthContext } from '@/contexts/AuthContext';

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
  const [preference, setPreference] = useState<string | null>(null);

  const assignableUnitIds = useMemo(
    () => user?.units?.map((u: { unitId: string }) => u.unitId) ?? [],
    [user?.units]
  );

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
      const ids = user?.units?.map((u: { unitId: string }) => u.unitId) ?? [];
      if (!ids.includes(id)) return;
      setPreference(id);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_PREFIX + user.id, id);
      }
    },
    [user]
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
