'use client';

import { ComponentType, ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
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
        <SidebarInset>
          <div className='p-4 md:p-8'>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
};

export default ProtectedSidebarLayout;
