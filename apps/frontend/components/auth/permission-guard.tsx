'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { userUnitPermissionMatches } from '@/lib/permission-variants';

interface PermissionGuardProps {
  children: React.ReactNode;
  permissions: string[];
  unitId?: string;
  requireAll?: boolean;
  fallback?: React.ReactNode;
  /** When false, tenant `system_admin` does not bypass — they need the listed unit permission(s). */
  tenantAdminBypass?: boolean;
}

export default function PermissionGuard({
  children,
  permissions,
  unitId,
  requireAll = false,
  fallback = null,
  tenantAdminBypass = true
}: PermissionGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuthContext();

  const sortedPermissions = useMemo(
    () => [...permissions].sort(),
    [permissions]
  );

  const hasAccess = useMemo(() => {
    if (isLoading) return null as boolean | null;
    if (!isAuthenticated || !user) return false;

    if (user.isPlatformAdmin === true) {
      return true;
    }
    const tenantSystemAdmin = user.isTenantAdmin === true;
    if (tenantAdminBypass && tenantSystemAdmin) {
      return true;
    }

    if (!unitId) {
      return false;
    }

    const userPermissions = user.permissions?.[unitId] || [];

    if (requireAll) {
      return sortedPermissions.every((p) =>
        userUnitPermissionMatches(userPermissions, p)
      );
    }
    return sortedPermissions.some((p) =>
      userUnitPermissionMatches(userPermissions, p)
    );
  }, [
    isLoading,
    isAuthenticated,
    user,
    unitId,
    requireAll,
    sortedPermissions,
    tenantAdminBypass
  ]);

  if (hasAccess === null) {
    return null;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
