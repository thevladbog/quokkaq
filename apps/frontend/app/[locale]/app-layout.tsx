'use client';

import { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import { SidebarInsetShell } from '@/components/SidebarInsetShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInsetShell>{children}</SidebarInsetShell>
    </SidebarProvider>
  );
}
