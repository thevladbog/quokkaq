'use client';

import { ReactNode, useMemo } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import PlatformSidebar from '@/components/PlatformSidebar';
import { usePathname } from 'next/navigation';
import ProtectedSidebarLayout from '@/components/ProtectedSidebarLayout';
import { platformRouteAllowsTenantAdmin } from '@/lib/platform-access';
import Image from 'next/image';

interface ConditionalLayoutProps {
  children: ReactNode;
}

const ConditionalLayout = ({ children }: ConditionalLayoutProps) => {
  const pathname = usePathname();

  // Define which paths should use the sidebar layout
  const layoutConfig = useMemo(() => {
    // Remove locale from pathname for comparison
    const pathWithoutLocale = pathname
      .replace(/^\/[a-z]{2}\//, '/')
      .replace(/^\/[a-z]{2}$/, '/');

    if (pathWithoutLocale.startsWith('/platform')) {
      const allowTenantAdmin = platformRouteAllowsTenantAdmin();
      return {
        useSidebar: true,
        protected: true,
        roles: allowTenantAdmin
          ? ['platform_admin', 'admin']
          : ['platform_admin'],
        SidebarComponent: PlatformSidebar
      };
    }

    if (pathWithoutLocale === '/') {
      return { useSidebar: true, protected: false };
    }

    if (pathWithoutLocale === '/kiosk') {
      return { useSidebar: false, protected: false };
    }

    if (pathWithoutLocale === '/login') {
      return { useSidebar: false, protected: false };
    }

    if (
      pathWithoutLocale === '/admin' ||
      pathWithoutLocale === '/admin/grid-configuration'
    ) {
      return { useSidebar: true, protected: true, roles: ['admin'] };
    }

    if (pathWithoutLocale === '/staff') {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff'],
        requiredPermission: 'ACCESS_STAFF_PANEL'
      };
    }

    // Organization pages - admin only
    if (
      pathWithoutLocale === '/organization' ||
      pathWithoutLocale.startsWith('/organization/')
    ) {
      return { useSidebar: true, protected: true, roles: ['admin'] };
    }

    // Pricing page - public but with sidebar
    if (pathWithoutLocale === '/pricing') {
      return { useSidebar: true, protected: false };
    }

    // Onboarding - admin only
    if (
      pathWithoutLocale === '/onboarding' ||
      pathWithoutLocale.startsWith('/onboarding/')
    ) {
      return { useSidebar: true, protected: true, roles: ['admin'] };
    }

    // Check if it's a subpage of admin that should use the same layout
    if (pathWithoutLocale.startsWith('/admin')) {
      // All admin subpages use sidebar layout
      return { useSidebar: true, protected: true, roles: ['admin'] };
    }

    if (
      pathWithoutLocale.startsWith('/staff') &&
      pathWithoutLocale !== '/staff'
    ) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff'],
        requiredPermission: 'ACCESS_STAFF_PANEL'
      };
    }

    if (
      pathWithoutLocale === '/supervisor' ||
      pathWithoutLocale.startsWith('/supervisor/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'supervisor'],
        requiredPermission: 'ACCESS_SUPERVISOR_PANEL'
      };
    }

    return { useSidebar: false, protected: false };
  }, [pathname]);

  const pathWithoutLocale = pathname
    .replace(/^\/[a-z]{2}\//, '/')
    .replace(/^\/[a-z]{2}$/, '/');
  const showBackground =
    !pathWithoutLocale.startsWith('/kiosk') &&
    !pathWithoutLocale.startsWith('/screen') &&
    !pathWithoutLocale.startsWith('/ticket');

  const backgroundElement = showBackground ? (
    <div className='pointer-events-none fixed -right-8 -bottom-8 z-0 h-96 w-96 opacity-5 select-none'>
      <Image
        src='/quokka-logo.svg'
        alt='Mascot Background'
        fill
        className='object-contain'
        priority
      />
    </div>
  ) : null;

  if (layoutConfig.useSidebar) {
    if (layoutConfig.protected) {
      // Use protected layout with sidebar
      return (
        <>
          <ProtectedSidebarLayout
            allowedRoles={layoutConfig.roles || []}
            requiredPermission={layoutConfig.requiredPermission}
            SidebarComponent={layoutConfig.SidebarComponent}
            fallbackComponent={
              <div className='flex min-h-screen items-center justify-center p-4'>
                <div className='text-center'>
                  <h1 className='text-destructive text-2xl font-bold'>
                    Access Denied
                  </h1>
                  <p>You don&apos;t have permission to view this page.</p>
                </div>
              </div>
            }
          >
            {children}
          </ProtectedSidebarLayout>
          {backgroundElement}
        </>
      );
    } else {
      // Use public layout with sidebar
      return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <main className='p-4 md:p-8'>{children}</main>
          </SidebarInset>
          {backgroundElement}
        </SidebarProvider>
      );
    }
  }

  // For other routes, render children without sidebar
  return (
    <>
      {children}
      {backgroundElement}
    </>
  );
};

export default ConditionalLayout;
