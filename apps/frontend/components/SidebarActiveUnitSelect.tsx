'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { getGetUnitsIdQueryKey } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
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

export function SidebarActiveUnitSelect({ className }: { className?: string }) {
  const tNav = useTranslations('nav');
  const { activeUnitId, setActiveUnitId, assignableUnitIds } = useActiveUnit();
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile } = useSidebar();
  const [unitPopoverOpen, setUnitPopoverOpen] = useState(false);

  const queries = useQueries({
    queries: assignableUnitIds.map((id) => ({
      queryKey: getGetUnitsIdQueryKey(id),
      queryFn: () => unitsApi.getById(id),
      enabled: assignableUnitIds.length > 0,
      staleTime: 5 * 60 * 1000
    }))
  });

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    queries.forEach((q, i) => {
      const id = assignableUnitIds[i];
      if (id && q.data?.name) map.set(id, q.data.name);
    });
    return map;
  }, [queries, assignableUnitIds]);

  if (assignableUnitIds.length === 0) return null;

  const disabled = assignableUnitIds.length === 1;

  const handleChange = (id: string) => {
    setActiveUnitId(id);
    const pl = pathname;
    if (pl.startsWith('/supervisor/')) {
      const seg = pl.split('/').filter(Boolean);
      if (seg.length >= 2 && seg[0] === 'supervisor') {
        if (seg[2] === 'journal') {
          router.replace(`/journal/${id}`);
        } else {
          router.replace(`/supervisor/${id}`);
        }
      }
    } else if (pl.startsWith('/journal/')) {
      const seg = pl.split('/').filter(Boolean);
      if (seg.length >= 2 && seg[0] === 'journal') {
        router.replace(`/journal/${id}`);
      }
    } else if (pl.startsWith('/clients/')) {
      const seg = pl.split('/').filter(Boolean);
      if (seg.length >= 2 && seg[0] === 'clients') {
        router.replace(`/clients/${id}`);
      }
    } else if (pl.startsWith('/pre-registrations/')) {
      const seg = pl.split('/').filter(Boolean);
      if (seg.length >= 2 && seg[0] === 'pre-registrations') {
        router.replace(`/pre-registrations/${id}`);
      }
    } else if (pl.startsWith('/staff/')) {
      const seg = pl.split('/').filter(Boolean);
      if (seg.length >= 2 && seg[0] === 'staff') {
        router.replace('/staff');
      }
    }
  };

  const value =
    activeUnitId && assignableUnitIds.includes(activeUnitId)
      ? activeUnitId
      : assignableUnitIds[0];

  const currentLabel = labelById.get(value) ?? value;
  const tooltipTitle = currentLabel || tNav('active_unit_placeholder');

  const desktopCollapsed = !isMobile && state === 'collapsed';

  const renderSelect = (triggerId: string, afterChange?: () => void) => (
    <Select
      value={value}
      onValueChange={(id) => {
        handleChange(id);
        afterChange?.();
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={triggerId}
        size='sm'
        className='h-8 w-full max-w-full min-w-0'
      >
        <SelectValue
          placeholder={tNav('active_unit_placeholder')}
          className='truncate'
        />
      </SelectTrigger>
      <SelectContent position='popper' align='start' className='z-[110]'>
        {assignableUnitIds.map((id) => (
          <SelectItem key={id} value={id}>
            <span className='truncate' title={labelById.get(id) ?? id}>
              {labelById.get(id) ?? id}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (desktopCollapsed) {
    if (disabled) {
      return (
        <div className='flex w-full justify-center px-0 pb-1'>
          <SidebarMenuButton
            type='button'
            disabled
            aria-disabled
            aria-label={`${tooltipTitle}. ${tNav('active_unit')}`}
            tooltip={{ children: tooltipTitle }}
          >
            <Building2 className='size-4' />
          </SidebarMenuButton>
        </div>
      );
    }
    return (
      <div className='flex w-full justify-center px-0 pb-1'>
        <Popover open={unitPopoverOpen} onOpenChange={setUnitPopoverOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              type='button'
              tooltip={{ children: tooltipTitle }}
            >
              <Building2 className='size-4' />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent side='right' align='start' className='z-[110] w-72'>
            <div className='space-y-2'>
              <Label htmlFor='sidebar-active-unit-popover'>
                {tNav('active_unit')}
              </Label>
              {renderSelect('sidebar-active-unit-popover', () =>
                setUnitPopoverOpen(false)
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5 px-2 pb-2', className)}>
      <Label
        htmlFor='sidebar-active-unit-expanded'
        className='text-muted-foreground px-1 text-xs font-medium'
      >
        {tNav('active_unit')}
      </Label>
      {renderSelect('sidebar-active-unit-expanded')}
    </div>
  );
}
