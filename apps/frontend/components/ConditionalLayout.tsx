'use client';

import { ReactNode, useMemo } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInsetShell } from '@/components/SidebarInsetShell';
import AppSidebar from '@/components/AppSidebar';
import PlatformSidebar from '@/components/PlatformSidebar';
import SettingsSidebar from '@/components/SettingsSidebar';
import { usePathname } from 'next/navigation';
import ProtectedSidebarLayout from '@/components/ProtectedSidebarLayout';
import { pathWithoutLocale as stripLocaleFromPath } from '@/lib/i18n-path';
import {
  PermAccessStaffPanel,
  PermAccessStatsSubdivision,
  PermAccessStatsZone,
  PermAccessSupervisorPanel,
  PermStatisticsRead,
  PermSupportReports
} from '@/lib/permission-variants';
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

  const layoutConfig = useMemo(() => {
    if (pathWithoutLocale.startsWith('/platform')) {
      return {
        useSidebar: true,
        protected: true,
        requirePlatformOperator: true,
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

    if (
      pathWithoutLocale === '/workplace-display' ||
      pathWithoutLocale.startsWith('/workplace-display/')
    ) {
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
        requireTenantAdmin: true,
        SidebarComponent: SettingsSidebar
      };
    }

    if (pathWithoutLocale === '/staff') {
      return {
        useSidebar: true,
        protected: true,
        requiredPermission: PermAccessStaffPanel
      };
    }

    if (
      pathWithoutLocale === '/pre-registrations' ||
      pathWithoutLocale.startsWith('/pre-registrations/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        requiredPermission: PermAccessStaffPanel
      };
    }

    if (
      pathWithoutLocale === '/onboarding' ||
      pathWithoutLocale.startsWith('/onboarding/')
    ) {
      return { useSidebar: true, protected: true, requireTenantAdmin: true };
    }

    if (
      pathWithoutLocale === '/staff/support' ||
      pathWithoutLocale.startsWith('/staff/support/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        requiredPermission: PermSupportReports
      };
    }

    if (
      pathWithoutLocale.startsWith('/staff') &&
      pathWithoutLocale !== '/staff'
    ) {
      return {
        useSidebar: true,
        protected: true,
        requiredPermission: PermAccessStaffPanel
      };
    }

    const isAuditJournalPath =
      /^\/supervisor\/[^/]+\/journal(\/|$)/.test(pathWithoutLocale) ||
      /^\/journal\//.test(pathWithoutLocale);

    if (isAuditJournalPath) {
      return {
        useSidebar: true,
        protected: true,
        requiredAnyPermission: [PermAccessStaffPanel, PermAccessSupervisorPanel]
      };
    }

    if (/^\/clients\//.test(pathWithoutLocale)) {
      return {
        useSidebar: true,
        protected: true,
        requiredAnyPermission: [PermAccessStaffPanel, PermAccessSupervisorPanel]
      };
    }

    if (
      pathWithoutLocale === '/statistics' ||
      pathWithoutLocale.startsWith('/statistics/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        requiredAnyPermission: [
          PermAccessStatsSubdivision,
          PermAccessStatsZone,
          PermStatisticsRead
        ]
      };
    }

    if (
      pathWithoutLocale === '/supervisor' ||
      pathWithoutLocale.startsWith('/supervisor/')
    ) {
      return {
        useSidebar: true,
        protected: true,
        requiredPermission: PermAccessSupervisorPanel
      };
    }

    return { useSidebar: false, protected: false };
  }, [pathWithoutLocale]);

  const showBackground =
    pathWithoutLocale !== '/login' &&
    !pathWithoutLocale.startsWith('/kiosk') &&
    !pathWithoutLocale.startsWith('/counter-display') &&
    pathWithoutLocale !== '/workplace-display' &&
    !pathWithoutLocale.startsWith('/workplace-display/') &&
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
      return (
        <>
          <ProtectedSidebarLayout
            requirePlatformOperator={layoutConfig.requirePlatformOperator}
            requireTenantAdmin={layoutConfig.requireTenantAdmin}
            requiredPermission={layoutConfig.requiredPermission}
            requiredAnyPermission={layoutConfig.requiredAnyPermission}
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
      return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInsetShell>{children}</SidebarInsetShell>
          {backgroundElement}
        </SidebarProvider>
      );
    }
  }

  return (
    <>
      {children}
      {backgroundElement}
    </>
  );
};

export default ConditionalLayout;
