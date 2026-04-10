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

  const permissionsSig = JSON.stringify([...permissions].sort());

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
    const required: string[] = JSON.parse(permissionsSig) as string[];

    if (requireAll) {
      return required.every((p) => userPermissions.includes(p));
    }
    return required.some((p) => userPermissions.includes(p));
  }, [isLoading, isAuthenticated, user, unitId, requireAll, permissionsSig]);

  if (hasAccess === null) {
    return null;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
