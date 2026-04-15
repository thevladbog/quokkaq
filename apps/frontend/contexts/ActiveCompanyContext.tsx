'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import {
  ACTIVE_COMPANY_CHANGED_EVENT,
  ACTIVE_COMPANY_ID_STORAGE_KEY
} from '@/lib/authenticated-api-fetch';

type ActiveCompanyContextValue = {
  /** Resolved from localStorage on the client; null if unset. */
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
};

const ActiveCompanyContext = createContext<
  ActiveCompanyContextValue | undefined
>(undefined);

function readStoredCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(ACTIVE_COMPANY_ID_STORAGE_KEY)?.trim();
  return v || null;
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => onStoreChange();
  window.addEventListener('storage', handler);
  window.addEventListener(ACTIVE_COMPANY_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(ACTIVE_COMPANY_CHANGED_EVENT, handler);
  };
}

function getServerSnapshot(): string | null {
  return null;
}

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const activeCompanyId = useSyncExternalStore(
    subscribe,
    readStoredCompanyId,
    getServerSnapshot
  );

  const setActiveCompanyId = useCallback((id: string | null) => {
    if (typeof window === 'undefined') return;
    if (id && id.trim() !== '') {
      localStorage.setItem(ACTIVE_COMPANY_ID_STORAGE_KEY, id.trim());
    } else {
      localStorage.removeItem(ACTIVE_COMPANY_ID_STORAGE_KEY);
    }
    try {
      window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_CHANGED_EVENT));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ activeCompanyId, setActiveCompanyId }),
    [activeCompanyId, setActiveCompanyId]
  );

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const ctx = useContext(ActiveCompanyContext);
  if (!ctx) {
    throw new Error(
      'useActiveCompany must be used within ActiveCompanyProvider'
    );
  }
  return ctx;
}
