'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/src/i18n/navigation';
import { useActiveUnit } from '@/contexts/ActiveUnitContext';
import { unitsApi } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function pathWithoutLocale(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}\//, '/').replace(/^\/[a-z]{2}$/, '/');
}

export function SidebarActiveUnitSelect({ className }: { className?: string }) {
  const tNav = useTranslations('nav');
  const { activeUnitId, setActiveUnitId, assignableUnitIds } = useActiveUnit();
  const pathname = usePathname();
  const router = useRouter();

  const queries = useQueries({
    queries: assignableUnitIds.map((id) => ({
      queryKey: ['unit', id] as const,
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
    const pl = pathWithoutLocale(pathname);
    if (pl.startsWith('/supervisor/')) {
      const seg = pl.split('/').filter(Boolean);
      if (seg.length >= 2 && seg[0] === 'supervisor') {
        router.replace(`/supervisor/${id}`);
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

  const value = activeUnitId ?? assignableUnitIds[0];

  return (
    <div className={cn('space-y-1.5 px-2 pb-2', className)}>
      <Label
        htmlFor='sidebar-active-unit'
        className='text-muted-foreground px-1 text-xs font-medium'
      >
        {tNav('active_unit')}
      </Label>
      <Select value={value} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger
          id='sidebar-active-unit'
          size='sm'
          className='h-8 w-full max-w-full min-w-0'
        >
          <SelectValue
            placeholder={tNav('active_unit_placeholder')}
            className='truncate'
          />
        </SelectTrigger>
        <SelectContent position='popper' align='start' className='z-50'>
          {assignableUnitIds.map((id) => (
            <SelectItem key={id} value={id}>
              <span className='truncate' title={labelById.get(id) ?? id}>
                {labelById.get(id) ?? id}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
