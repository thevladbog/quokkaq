'use client';

import { ReactNode } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import ProtectedRoute from '@/components/ProtectedRoute';

interface ProtectedSidebarLayoutProps {
  children: ReactNode;
  allowedRoles: string[];
  requiredPermission?: string;
  fallbackComponent?: ReactNode;
  loadingComponent?: ReactNode;
}

const ProtectedSidebarLayout = ({
  children,
  allowedRoles,
  requiredPermission,
  fallbackComponent,
  loadingComponent
}: ProtectedSidebarLayoutProps) => {
  return (
    <ProtectedRoute
      allowedRoles={allowedRoles}
      requiredPermission={requiredPermission}
      fallbackComponent={fallbackComponent}
      loadingComponent={loadingComponent}
    >
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className='p-4 md:p-8'>{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
};

export default ProtectedSidebarLayout;
