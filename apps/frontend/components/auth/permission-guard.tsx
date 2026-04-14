'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';

interface PermissionGuardProps {
  children: React.ReactNode;
  permissions: string[];
  unitId?: string;
  requireAll?: boolean;
  fallback?: React.ReactNode;
  /** When false, tenant `admin` does not bypass — they need the listed unit permission(s). */
  adminBypass?: boolean;
}

export default function PermissionGuard({
  children,
  permissions,
  unitId,
  requireAll = false,
  fallback = null,
  adminBypass = true
}: PermissionGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuthContext();

  const sortedPermissions = useMemo(
    () => [...permissions].sort(),
    [permissions]
  );

  const hasAccess = useMemo(() => {
    if (isLoading) return null as boolean | null;
    if (!isAuthenticated || !user) return false;

    if (user.roles?.includes('platform_admin')) {
      return true;
    }
    if (adminBypass && user.roles?.includes('admin')) {
      return true;
    }

    if (!unitId) {
      return false;
    }

    const userPermissions = user.permissions?.[unitId] || [];

    if (requireAll) {
      return sortedPermissions.every((p) => userPermissions.includes(p));
    }
    return sortedPermissions.some((p) => userPermissions.includes(p));
  }, [
    isLoading,
    isAuthenticated,
    user,
    unitId,
    requireAll,
    sortedPermissions,
    adminBypass
  ]);

  if (hasAccess === null) {
    return null;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
