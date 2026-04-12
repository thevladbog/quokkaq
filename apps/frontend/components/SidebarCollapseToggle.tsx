'use client';

import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar';

/** Desktop-only control to expand/collapse the sidebar (clearer than the edge rail). */
export function SidebarCollapseToggle() {
  const t = useTranslations('nav');
  const { toggleSidebar, state, isMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  const collapsed = state === 'collapsed';

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type='button'
        onClick={toggleSidebar}
        tooltip={collapsed ? t('sidebar_expand') : t('sidebar_collapse')}
      >
        {collapsed ? (
          <ChevronsRight className='size-4' />
        ) : (
          <ChevronsLeft className='size-4' />
        )}
        <span>{collapsed ? t('sidebar_expand') : t('sidebar_collapse')}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
