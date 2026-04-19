'use client';

import { ReactNode, useMemo } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInsetShell } from '@/components/SidebarInsetShell';
import AppSidebar from '@/components/AppSidebar';
import PlatformSidebar from '@/components/PlatformSidebar';
import SettingsSidebar from '@/components/SettingsSidebar';
import { usePathname } from 'next/navigation';
import ProtectedSidebarLayout from '@/components/ProtectedSidebarLayout';
import { platformRouteAllowsTenantAdmin } from '@/lib/platform-access';
import { pathWithoutLocale as stripLocaleFromPath } from '@/lib/i18n-path';
import Image from 'next/image';

interface ConditionalLayoutProps {
  children: ReactNode;
}

const ConditionalLayout = ({ children }: ConditionalLayoutProps) => {
  const pathname = usePathname();

  const pathWithoutLocale = useMemo(
    () => stripLocaleFromPath(pathname),
    [pathname]
  );

  // Define which paths should use the sidebar layout
  const layoutConfig = useMemo(() => {
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

    if (pathWithoutLocale.startsWith('/counter-display')) {
      return { useSidebar: false, protected: false };
    }

    if (pathWithoutLocale.startsWith('/workplace-display')) {
      return { useSidebar: false, protected: false };
    }

    if (pathWithoutLocale === '/login') {
      return { useSidebar: false, protected: false };
    }

    if (
      pathWithoutLocale === '/settings' ||
      pathWithoutLocale.startsWith('/settings/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin'],
        SidebarComponent: SettingsSidebar
      };
    }

    if (pathWithoutLocale === '/staff') {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff'],
        requiredPermission: 'ACCESS_STAFF_PANEL'
      };
    }

    if (
      pathWithoutLocale === '/pre-registrations' ||
      pathWithoutLocale.startsWith('/pre-registrations/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff', 'supervisor']
      };
    }

    // Onboarding - admin only
    if (
      pathWithoutLocale === '/onboarding' ||
      pathWithoutLocale.startsWith('/onboarding/')
    ) {
      return { useSidebar: true, protected: true, roles: ['admin'] };
    }

    if (
      pathWithoutLocale === '/staff/support' ||
      pathWithoutLocale.startsWith('/staff/support/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff', 'supervisor', 'operator']
      };
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

    const isAuditJournalPath =
      /^\/supervisor\/[^/]+\/journal(\/|$)/.test(pathWithoutLocale) ||
      /^\/journal\//.test(pathWithoutLocale);

    if (isAuditJournalPath) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff', 'supervisor', 'operator']
      };
    }

    if (/^\/clients\//.test(pathWithoutLocale)) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff', 'supervisor', 'operator']
      };
    }

    if (
      pathWithoutLocale === '/statistics' ||
      pathWithoutLocale.startsWith('/statistics/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        roles: ['admin', 'staff', 'supervisor', 'operator']
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
  }, [pathWithoutLocale]);

  const showBackground =
    pathWithoutLocale !== '/login' &&
    !pathWithoutLocale.startsWith('/kiosk') &&
    !pathWithoutLocale.startsWith('/counter-display') &&
    !pathWithoutLocale.startsWith('/workplace-display') &&
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
          <SidebarInsetShell>{children}</SidebarInsetShell>
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
