'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Ban } from 'lucide-react';
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
import { getUnitDisplayName } from '@/lib/unit-display';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';

const MAX_UNIT_TAGS = 4;
const MAX_ROLE_TAGS = 3;

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
  const locale = useLocale();

  const colNames = useMemo(
    () => ({
      user: t('table_column_user'),
      units: t('table_column_units'),
      tenantRoles: t('table_column_tenant_roles'),
      blocked: t('table_column_blocked'),
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
          <TableHead className='w-[28%]'>{colNames.user}</TableHead>
          <TableHead className='w-[22%]'>{colNames.units}</TableHead>
          <TableHead className='w-[22%]'>{colNames.tenantRoles}</TableHead>
          <TableHead className='w-[14%] text-center'>
            {colNames.blocked}
          </TableHead>
          <TableHead className='w-[14%] text-center'>
            {colNames.admin}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isAdmin = isTenantAdminUser(user);
          const seenUnitIds = new Set<string>();
          const unitRows = (user.units ?? []).filter((uu) => {
            if (seenUnitIds.has(uu.unitId)) return false;
            seenUnitIds.add(uu.unitId);
            return true;
          });
          const extra = Math.max(0, unitRows.length - MAX_UNIT_TAGS);
          const tenantRoles = user.tenantRoles ?? [];
          const extraRoles = Math.max(0, tenantRoles.length - MAX_ROLE_TAGS);
          const isBlocked = user.isActive === false;

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
                      getUnitDisplayName(
                        {
                          name: u?.name ?? uu.unit?.name ?? '',
                          nameEn: u?.nameEn ?? uu.unit?.nameEn
                        },
                        locale
                      ) || uu.unitId.slice(0, 8);
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
              <TableCell className='whitespace-normal'>
                <div className='flex flex-wrap gap-1'>
                  {tenantRoles.slice(0, MAX_ROLE_TAGS).map((tr) => (
                    <Badge
                      key={tr.id}
                      variant='secondary'
                      className='max-w-[160px] truncate font-normal'
                      title={tr.name}
                    >
                      <span className='truncate'>{tr.name}</span>
                    </Badge>
                  ))}
                  {extraRoles > 0 ? (
                    <Badge variant='outline' className='font-normal'>
                      +{extraRoles}
                    </Badge>
                  ) : null}
                  {tenantRoles.length === 0 ? (
                    <span className='text-muted-foreground text-sm'>—</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className='text-center'>
                {isBlocked ? (
                  <Ban
                    className='inline-block size-5 text-red-600 dark:text-red-500'
                    aria-label={t('blocked_badge_aria')}
                  />
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </TableCell>
              <TableCell className='text-center'>
                {isAdmin ? (
                  <BadgeCheck
                    className='inline-block size-5 text-emerald-600 dark:text-emerald-500'
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
