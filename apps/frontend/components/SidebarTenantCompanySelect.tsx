'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building } from 'lucide-react';
import { useGetAuthAccessibleCompanies } from '@/lib/api/generated/auth';
import { useAuthContext } from '@/contexts/AuthContext';
import { useActiveCompany } from '@/contexts/ActiveCompanyContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function SidebarTenantCompanySelect({
  className
}: {
  className?: string;
}) {
  const tNav = useTranslations('nav');
  const { user, isAuthenticated } = useAuthContext();
  const { activeCompanyId, setActiveCompanyId } = useActiveCompany();
  const queryClient = useQueryClient();
  const { state, isMobile } = useSidebar();

  const { data: companies = [], isLoading } = useGetAuthAccessibleCompanies(
    undefined,
    {
      query: {
        enabled: isAuthenticated,
        staleTime: 60 * 1000,
        select: (r) => (r.status === 200 ? (r.data.companies ?? []) : [])
      }
    }
  );

  const fallbackFromUser = useMemo(() => {
    const u = user?.units?.find(
      (x: { companyId?: string }) => x.companyId
    )?.companyId;
    return u ?? null;
  }, [user?.units]);

  const resolvedValue = useMemo(() => {
    if (companies.length === 0) return '';
    if (activeCompanyId && companies.some((c) => c.id === activeCompanyId)) {
      return activeCompanyId;
    }
    if (fallbackFromUser && companies.some((c) => c.id === fallbackFromUser)) {
      return fallbackFromUser;
    }
    return companies[0]?.id ?? '';
  }, [companies, activeCompanyId, fallbackFromUser]);

  const handleChange = (id: string) => {
    setActiveCompanyId(id);
    void queryClient.invalidateQueries();
  };

  if (!isAuthenticated || companies.length <= 1 || isLoading) {
    return null;
  }

  const currentLabel =
    companies.find((c) => c.id === resolvedValue)?.name ?? resolvedValue;
  const tooltipTitle = currentLabel || tNav('organization');

  const desktopCollapsed = !isMobile && state === 'collapsed';

  const renderSelect = (triggerId: string, afterChange?: () => void) => (
    <Select
      value={resolvedValue}
      onValueChange={(id) => {
        handleChange(id);
        afterChange?.();
      }}
    >
      <SelectTrigger
        id={triggerId}
        size='sm'
        className='h-8 w-full max-w-full min-w-0'
      >
        <SelectValue placeholder={tNav('organization')} className='truncate' />
      </SelectTrigger>
      <SelectContent position='popper' align='start' className='z-[110]'>
        {companies.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            <span className='truncate' title={c.name}>
              {c.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (desktopCollapsed) {
    return (
      <div className={cn('flex w-full justify-center px-0 pb-1', className)}>
        <Popover>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              type='button'
              tooltip={{ children: tooltipTitle }}
            >
              <Building className='size-4' />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent side='right' align='start' className='z-[110] w-72'>
            <div className='space-y-2'>
              <Label htmlFor='sidebar-tenant-company-popover'>
                {tNav('organization')}
              </Label>
              {renderSelect('sidebar-tenant-company-popover')}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5 px-2 pb-2', className)}>
      <Label
        htmlFor='sidebar-tenant-company-expanded'
        className='text-muted-foreground px-1 text-xs font-medium'
      >
        {tNav('organization')}
      </Label>
      {renderSelect('sidebar-tenant-company-expanded')}
    </div>
  );
}
