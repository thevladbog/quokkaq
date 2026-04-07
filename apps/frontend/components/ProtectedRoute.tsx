'use client';

import { Spinner } from '@/components/ui/spinner';
import { useAuthContext } from '@/contexts/AuthContext';
import { useRouter } from '@/src/i18n/navigation';
import { ReactNode, useEffect } from 'react';
import { useLocale } from 'next-intl';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[]; // Optional: array of allowed roles
  requiredPermission?: string; // Optional: permission required in at least one unit
  fallbackComponent?: ReactNode; // Optional: component to show if access denied
  loadingComponent?: ReactNode; // Optional: component to show while loading
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requiredPermission,
  fallbackComponent,
  loadingComponent
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuthContext();
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to the login page with the current locale
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router, locale]);

  // Check access if user is loaded
  if (user) {
    let hasAccess = true;

    // Check roles if specified
    if (allowedRoles && allowedRoles.length > 0) {
      const hasRole = allowedRoles.some((role) => user.roles?.includes(role));

      // If user doesn't have role, check for permission if specified
      if (!hasRole) {
        if (requiredPermission && user.permissions) {
          // Check if user has the permission in ANY unit
          const hasPermission = (
            Object.values(user.permissions) as string[][]
          ).some((perms: string[]) => perms.includes(requiredPermission));
          if (!hasPermission) {
            hasAccess = false;
          }
        } else {
          // No permission specified or no permissions object, so role check failure is final
          hasAccess = false;
        }
      }
    } else if (requiredPermission) {
      // Only permission specified
      if (user.permissions) {
        const hasPermission = (
          Object.values(user.permissions) as string[][]
        ).some((perms: string[]) => perms.includes(requiredPermission));
        if (!hasPermission) {
          hasAccess = false;
        }
      } else {
        hasAccess = false;
      }
    }

    if (!hasAccess) {
      return fallbackComponent || <div>Access Denied</div>;
    }
  }

  // Show loading state while checking auth status
  if (isLoading) {
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

  // If authenticated, render children
  return <>{children}</>;
}
