'use client';

import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';

interface PermissionGuardProps {
  children: React.ReactNode;
  permissions: string[];
  unitId?: string;
  requireAll?: boolean;
  fallback?: React.ReactNode;
}

export default function PermissionGuard({
  children,
  permissions,
  unitId,
  requireAll = false,
  fallback = null
}: PermissionGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuthContext();

  const sortedPermissions = useMemo(
    () => [...permissions].sort(),
    [permissions]
  );

  const hasAccess = useMemo(() => {
    if (isLoading) return null as boolean | null;
    if (!isAuthenticated || !user) return false;

    if (user.roles?.includes('admin')) {
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
  }, [isLoading, isAuthenticated, user, unitId, requireAll, sortedPermissions]);

  if (hasAccess === null) {
    return null;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
