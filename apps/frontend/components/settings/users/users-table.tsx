'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck } from 'lucide-react';
import type { Unit, User } from '@quokkaq/shared-types';
import { unitKindBadgeClassName } from '@/components/admin/units/unit-kind-badge-styles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const MAX_UNIT_TAGS = 4;

export interface UsersTableProps {
  users: User[];
  unitsById: Map<string, Unit>;
  loading?: boolean;
  onRowClick: (userId: string) => void;
  selectedUserId: string | null;
}

export function UsersTable({
  users,
  unitsById,
  loading,
  onRowClick,
  selectedUserId
}: UsersTableProps) {
  const t = useTranslations('admin.users');

  const colNames = useMemo(
    () => ({
      user: t('table_column_user'),
      units: t('table_column_units'),
      admin: t('table_column_admin')
    }),
    [t]
  );

  if (loading) {
    return (
      <div className='text-muted-foreground py-8 text-center'>
        {t('loading_users')}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className='text-muted-foreground py-8 text-center'>
        {t('no_users')}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-[40%]'>{colNames.user}</TableHead>
          <TableHead className='w-[45%]'>{colNames.units}</TableHead>
          <TableHead className='w-[15%] text-center'>
            {colNames.admin}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isAdmin = user.roles?.includes('admin');
          const unitRows = user.units ?? [];
          const extra = Math.max(0, unitRows.length - MAX_UNIT_TAGS);

          return (
            <TableRow
              key={user.id}
              data-state={selectedUserId === user.id ? 'selected' : undefined}
              className={cn(
                'cursor-pointer',
                selectedUserId === user.id && 'bg-muted/50'
              )}
              onClick={() => onRowClick(user.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(user.id);
                }
              }}
              tabIndex={0}
              role='button'
              aria-label={t('open_user_settings_aria', { name: user.name })}
            >
              <TableCell>
                <div className='flex min-w-0 items-center gap-3'>
                  <Avatar size='sm' className='shrink-0'>
                    {user.photoUrl ? (
                      <AvatarImage src={user.photoUrl} alt='' />
                    ) : null}
                    <AvatarFallback className='text-xs'>
                      {user.name
                        .split(/\s+/)
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className='min-w-0'>
                    <div className='truncate font-medium'>{user.name}</div>
                    <div className='text-muted-foreground truncate text-sm'>
                      {user.email ?? '—'}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className='whitespace-normal'>
                <div className='flex flex-wrap gap-1'>
                  {unitRows.slice(0, MAX_UNIT_TAGS).map((uu) => {
                    const u = unitsById.get(uu.unitId);
                    const label =
                      u?.name ?? uu.unit?.name ?? uu.unitId.slice(0, 8);
                    const kind = u?.kind ?? uu.unit?.kind;
                    return (
                      <Badge
                        key={uu.unitId}
                        variant='outline'
                        className={cn(
                          'max-w-[140px] truncate font-normal',
                          unitKindBadgeClassName(kind)
                        )}
                        title={label}
                      >
                        <span className='truncate'>{label}</span>
                      </Badge>
                    );
                  })}
                  {extra > 0 ? (
                    <Badge variant='secondary' className='font-normal'>
                      +{extra}
                    </Badge>
                  ) : null}
                  {unitRows.length === 0 ? (
                    <span className='text-muted-foreground text-sm'>—</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className='text-center'>
                {isAdmin ? (
                  <BadgeCheck
                    className='text-primary inline-block size-5'
                    aria-label={t('admin_badge_aria')}
                  />
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
