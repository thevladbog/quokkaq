'use client';

import { Spinner } from '@/components/ui/spinner';
import { useAuthContext } from '@/contexts/AuthContext';
import type { User } from '@/lib/api';
import { flatPermissionsInclude } from '@/lib/permission-variants';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';
import { useRouter } from '@/src/i18n/navigation';
import { ReactNode, useEffect } from 'react';
import { useLocale } from 'next-intl';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Only SaaS `platform_admin` may access (e.g. /platform). */
  requirePlatformOperator?: boolean;
  /** Tenant admin: global admin, platform_admin, or tenant role `system_admin`. */
  requireTenantAdmin?: boolean;
  /** Single permission (canonical or legacy) in at least one unit, unless tenant admin. */
  requiredPermission?: string;
  /** Any of these permissions in any unit grants access, unless tenant admin. */
  requiredAnyPermission?: string[];
  fallbackComponent?: ReactNode;
  loadingComponent?: ReactNode;
}

function permissionsFlat(user: User | null): string[] {
  if (!user?.permissions) return [];
  return (Object.values(user.permissions) as string[][]).flat();
}

function userHasAccess(
  user: User,
  opts: {
    requirePlatformOperator?: boolean;
    requireTenantAdmin?: boolean;
    requiredPermission?: string;
    requiredAnyPermission?: string[];
  }
): boolean {
  if (opts.requirePlatformOperator) {
    return user.isPlatformAdmin === true;
  }
  if (opts.requireTenantAdmin) {
    return isTenantAdminUser(user);
  }
  if (isTenantAdminUser(user)) {
    return true;
  }
  const flat = permissionsFlat(user);
  if (opts.requiredAnyPermission && opts.requiredAnyPermission.length > 0) {
    return opts.requiredAnyPermission.some((p) =>
      flatPermissionsInclude(flat, p)
    );
  }
  if (opts.requiredPermission) {
    return flatPermissionsInclude(flat, opts.requiredPermission);
  }
  return true;
}

export default function ProtectedRoute({
  children,
  requirePlatformOperator,
  requireTenantAdmin,
  requiredPermission,
  requiredAnyPermission,
  fallbackComponent,
  loadingComponent
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, token } = useAuthContext();
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && token == null) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router, locale, token]);

  if (user) {
    const hasAccess = userHasAccess(user, {
      requirePlatformOperator,
      requireTenantAdmin,
      requiredPermission,
      requiredAnyPermission
    });
    if (!hasAccess) {
      return fallbackComponent || <div>Access Denied</div>;
    }
  }

  const sessionResolving = Boolean(token && !user);

  if (isLoading || sessionResolving) {
    return (
      loadingComponent || (
        <div className='flex min-h-screen items-center justify-center p-4'>
          <div className='text-center'>
            <Spinner className='text-primary mx-auto mb-4 h-12 w-12' />
            <p className='text-muted-foreground'>Loading...</p>
          </div>
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
