'use client';

import type { ReactNode } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { ActiveUnitProvider } from '@/contexts/ActiveUnitContext';

/**
 * Remounts active-unit state when the logged-in user changes so preferences
 * and localStorage keys stay aligned with `user.id`.
 */
export function ActiveUnitGate({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();
  return (
    <ActiveUnitProvider key={user?.id ?? 'guest'}>
      {children}
    </ActiveUnitProvider>
  );
}
