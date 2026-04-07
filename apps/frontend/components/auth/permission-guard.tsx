'use client';

import { useAuth } from '@/lib/hooks';
import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api';

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
  const { isAuthenticated, token } = useAuth();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      if (!isAuthenticated || !token) {
        setHasAccess(false);
        return;
      }

      try {
        // In a real app, we would decode the token or fetch user info from context
        // For now, we'll fetch the user info
        const user = await authApi.me(token);

        if (user.roles?.includes('admin')) {
          setHasAccess(true);
          return;
        }

        if (!unitId) {
          // If no unit context, we can't check unit-specific permissions
          // But maybe we want to check global roles?
          // For now, assume false if permissions are required but no unit context
          setHasAccess(false);
          return;
        }

        const userPermissions = user.permissions?.[unitId] || [];

        if (requireAll) {
          setHasAccess(permissions.every((p) => userPermissions.includes(p)));
        } else {
          setHasAccess(permissions.some((p) => userPermissions.includes(p)));
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setHasAccess(false);
      }
    };

    checkAccess();
  }, [isAuthenticated, token, permissions, unitId, requireAll]);

  if (hasAccess === null) {
    return null; // Loading
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
