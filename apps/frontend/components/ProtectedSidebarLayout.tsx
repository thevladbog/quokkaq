'use client';

import { ComponentType, ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarInsetShell } from '@/components/SidebarInsetShell';
import AppSidebar from '@/components/AppSidebar';
import OperationalSupportFab from '@/components/staff/OperationalSupportFab';
import ProtectedRoute from '@/components/ProtectedRoute';

interface ProtectedSidebarLayoutProps {
  children: ReactNode;
  allowedRoles: string[];
  requiredPermission?: string;
  fallbackComponent?: ReactNode;
  loadingComponent?: ReactNode;
  /** Defaults to AppSidebar (tenant). Use PlatformSidebar for /platform routes. */
  SidebarComponent?: ComponentType<{ className?: string }>;
}

const ProtectedSidebarLayout = ({
  children,
  allowedRoles,
  requiredPermission,
  fallbackComponent,
  loadingComponent,
  SidebarComponent = AppSidebar
}: ProtectedSidebarLayoutProps) => {
  return (
    <ProtectedRoute
      allowedRoles={allowedRoles}
      requiredPermission={requiredPermission}
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
