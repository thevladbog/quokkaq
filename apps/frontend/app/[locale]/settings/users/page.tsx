'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { UserSettingsSheet } from '@/components/settings/users/user-settings-sheet';
import { UsersTable } from '@/components/settings/users/users-table';
import { useUnits, useUsers } from '@/lib/hooks';
import { useTranslations } from 'next-intl';
import type { Unit, User } from '@quokkaq/shared-types';

export default function UsersPage() {
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [debouncedUserSearchTerm, setDebouncedUserSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUserSearchTerm(userSearchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [userSearchTerm]);

  const {
    data: users = [],
    isLoading: usersLoading,
    error: usersError
  } = useUsers(debouncedUserSearchTerm);
  const { data: units = [], isLoading: unitsLoading } = useUnits();

  const t = useTranslations('admin');

  const unitsById = useMemo(
    () => new Map((units as Unit[]).map((u) => [u.id, u])),
    [units]
  );

  const selectedUser = useMemo(
    () => (users as User[]).find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const openSheet = (userId: string) => {
    setSelectedUserId(userId);
    setSheetOpen(true);
  };

  if (usersError) {
    return (
      <div className='container mx-auto p-4'>
        {t('users.error_loading', { error: (usersError as Error).message })}
      </div>
    );
  }

  return (
    <div className='container mx-auto max-w-6xl p-4'>
      <h1 className='mb-2 text-3xl font-bold'>{t('users.title')}</h1>
      <p className='text-muted-foreground mb-6'>{t('users.description')}</p>

      <div className='mb-4'>
        <Input
          placeholder={t('users.search_placeholder')}
          value={userSearchTerm}
          onChange={(e) => setUserSearchTerm(e.target.value)}
          className='max-w-md'
        />
      </div>

      <UsersTable
        users={users as User[]}
        unitsById={unitsById}
        loading={usersLoading || unitsLoading}
        selectedUserId={selectedUserId}
        onRowClick={openSheet}
      />

      <UserSettingsSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setSelectedUserId(null);
          }
        }}
        user={selectedUser}
        units={units as Unit[]}
      />
    </div>
  );
}
