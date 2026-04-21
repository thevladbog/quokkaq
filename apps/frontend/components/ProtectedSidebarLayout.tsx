'use client';

import { ComponentType, ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInsetShell } from '@/components/SidebarInsetShell';
import AppSidebar from '@/components/AppSidebar';
import OperationalSupportFab from '@/components/staff/OperationalSupportFab';
import ProtectedRoute from '@/components/ProtectedRoute';

interface ProtectedSidebarLayoutProps {
  children: ReactNode;
  requirePlatformOperator?: boolean;
  requireTenantAdmin?: boolean;
  requiredPermission?: string;
  requiredAnyPermission?: string[];
  fallbackComponent?: ReactNode;
  loadingComponent?: ReactNode;
  /** Defaults to AppSidebar (tenant). Use PlatformSidebar for /platform routes. */
  SidebarComponent?: ComponentType<{ className?: string }>;
}

const ProtectedSidebarLayout = ({
  children,
  requirePlatformOperator,
  requireTenantAdmin,
  requiredPermission,
  requiredAnyPermission,
  fallbackComponent,
  loadingComponent,
  SidebarComponent = AppSidebar
}: ProtectedSidebarLayoutProps) => {
  return (
    <ProtectedRoute
      requirePlatformOperator={requirePlatformOperator}
      requireTenantAdmin={requireTenantAdmin}
      requiredPermission={requiredPermission}
      requiredAnyPermission={requiredAnyPermission}
      fallbackComponent={fallbackComponent}
      loadingComponent={loadingComponent}
    >
      <SidebarProvider>
        <SidebarComponent />
        <SidebarInsetShell>{children}</SidebarInsetShell>
        <OperationalSupportFab />
      </SidebarProvider>
    </ProtectedRoute>
  );
};

export default ProtectedSidebarLayout;
