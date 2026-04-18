'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Unit, User } from '@quokkaq/shared-types';
import { UserProfileFields } from '@/components/settings/users/user-profile-fields';
import {
  canManageUnitUsers,
  getAvailableUnitsForManager
} from '@/components/settings/users/user-settings-access';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  useAssignUserToUnit,
  useCurrentUser,
  useRemoveUserFromUnit,
  useUpdateUser,
  useUserUnits
} from '@/lib/hooks';
import { UNIT_PERMISSIONS } from '@/lib/unit-permissions';
import { cn } from '@/lib/utils';
import { getUnitDisplayName } from '@/lib/unit-display';

interface SheetUserUnit {
  id: string;
  unitId: string;
  /** May be missing from API JSON */
  permissions?: string[] | null;
  unit?: { id: string; name: string; code: string; nameEn?: string | null };
}

interface UserSettingsSheetBodyProps {
  user: User;
  open: boolean;
  units: Unit[];
}

function UserSettingsSheetBody({
  user,
  open,
  units
}: UserSettingsSheetBodyProps) {
  const t = useTranslations('admin.users');
  const locale = useLocale();
  const { data: currentUser } = useCurrentUser();
  const [editName, setEditName] = useState(user.name);
  const [searchAvailable, setSearchAvailable] = useState('');
  const [assigningUnitId, setAssigningUnitId] = useState<string | null>(null);
  const [assignPerms, setAssignPerms] = useState<string[]>([]);

  const userId = user.id;
  const {
    data: userUnitsRaw,
    isLoading: userUnitsLoading,
    refetch: refetchUserUnits
  } = useUserUnits(userId, { enabled: open && !!userId });

  const assignMutation = useAssignUserToUnit();
  const removeMutation = useRemoveUserFromUnit();
  const updateUserMutation = useUpdateUser();

  const userUnits = useMemo(() => {
    const raw = ((userUnitsRaw ?? []) as SheetUserUnit[]).map((uu) => ({
      ...uu,
      permissions: Array.isArray(uu.permissions) ? uu.permissions : []
    }));
    // Legacy bug: backend used to INSERT on every permission change, duplicating (userId, unitId).
    // Merge rows per unitId (union permissions) so the UI shows one accordion per unit.
    const byUnit = new Map<string, SheetUserUnit>();
    for (const uu of raw) {
      const prev = byUnit.get(uu.unitId);
      if (!prev) {
        byUnit.set(uu.unitId, uu);
        continue;
      }
      const merged = new Set([
        ...(prev.permissions ?? []),
        ...(uu.permissions ?? [])
      ]);
      byUnit.set(uu.unitId, {
        ...prev,
        permissions: Array.from(merged)
      });
    }
    return Array.from(byUnit.values());
  }, [userUnitsRaw]);

  const unitsById = useMemo(
    () => new Map(units.map((u) => [u.id, u])),
    [units]
  );

  const availableUnits = useMemo(() => {
    return getAvailableUnitsForManager(units, currentUser as User | undefined);
  }, [units, currentUser]);

  const selectedUnitIds = useMemo(
    () => new Set(userUnits.map((u) => u.unitId)),
    [userUnits]
  );

  const filteredAvailable = useMemo(() => {
    const q = searchAvailable.toLowerCase();
    return availableUnits
      .filter((u) => !selectedUnitIds.has(u.id))
      .filter((u) => {
        const display = getUnitDisplayName(u, locale).toLowerCase();
        const en = (u.nameEn ?? '').toLowerCase();
        return (
          display.includes(q) ||
          u.name.toLowerCase().includes(q) ||
          en.includes(q) ||
          u.code.toLowerCase().includes(q)
        );
      });
  }, [availableUnits, selectedUnitIds, searchAvailable, locale]);

  const isSystemAdmin = user?.roles?.includes('admin');

  const getPermissionLabel = (permissionId: string) =>
    (t as (key: string) => string)(`permissions_list.${permissionId}`) ||
    permissionId;

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { name: editName.trim() }
    });
  };

  const handlePhotoUploaded = async (url: string) => {
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { photoUrl: url }
    });
  };

  const handlePhotoRemoved = async () => {
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { photoUrl: '' }
    });
  };

  const handleToggleAdmin = async (checked: boolean) => {
    const base = [...(user.roles ?? [])];
    const nextRoles = checked
      ? base.includes('admin')
        ? base
        : [...base, 'admin']
      : base.filter((r) => r !== 'admin');
    await updateUserMutation.mutateAsync({
      userId: user.id,
      data: { roles: nextRoles }
    });
  };

  const applyUnitPermissions = async (
    unitId: string,
    permissions: string[]
  ) => {
    await assignMutation.mutateAsync({
      userId: user.id,
      unitId,
      permissions
    });
    refetchUserUnits();
  };

  const toggleAssignedPermission = async (
    uu: SheetUserUnit,
    permissionId: string
  ) => {
    const current = uu.permissions ?? [];
    const next = current.includes(permissionId)
      ? current.filter((p) => p !== permissionId)
      : [...current, permissionId];
    await applyUnitPermissions(uu.unitId, next);
  };

  const handleRemoveUnit = async (unitId: string) => {
    await removeMutation.mutateAsync({ userId: user.id, unitId });
    refetchUserUnits();
  };

  const startAssign = (unitId: string) => {
    setAssigningUnitId(unitId);
    setAssignPerms([]);
  };

  const confirmAssign = async () => {
    if (!assigningUnitId) return;
    await assignMutation.mutateAsync({
      userId: user.id,
      unitId: assigningUnitId,
      permissions: assignPerms
    });
    refetchUserUnits();
    setAssigningUnitId(null);
    setAssignPerms([]);
  };

  const toggleAssignPerm = (permissionId: string) => {
    setAssignPerms((prev) =>
      prev.includes(permissionId)
        ? prev.filter((p) => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  return (
    <>
      <SheetHeader className='text-left'>
        <SheetTitle>{t('sheet_title')}</SheetTitle>
        <SheetDescription>
          {user.name}
          {user.email ? ` · ${user.email}` : ''}
        </SheetDescription>
      </SheetHeader>

      <div className='flex flex-1 flex-col gap-6 px-4 pb-8'>
        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('profile_section')}</h3>
          <UserProfileFields
            name={editName}
            onNameChange={setEditName}
            onSaveName={handleSaveName}
            savingName={updateUserMutation.isPending}
            photoUrl={user.photoUrl}
            onPhotoUploaded={handlePhotoUploaded}
            onPhotoRemoved={handlePhotoRemoved}
            photoBusy={updateUserMutation.isPending}
          />
        </section>

        <Separator />

        {currentUser?.roles?.includes('admin') ? (
          <>
            <section className='space-y-3'>
              <h3 className='text-sm font-medium'>{t('role_section')}</h3>
              <div className='bg-muted/20 flex items-center justify-between rounded-lg border p-4'>
                <div>
                  <p className='font-medium'>{t('system_admin')}</p>
                  <p className='text-muted-foreground text-sm'>
                    {t('system_admin_desc')}
                  </p>
                </div>
                <Switch
                  checked={!!isSystemAdmin}
                  onCheckedChange={handleToggleAdmin}
                  disabled={updateUserMutation.isPending}
                  aria-label={t('system_admin')}
                />
              </div>
            </section>
            <Separator />
          </>
        ) : null}

        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('units_section')}</h3>
          {userUnitsLoading ? (
            <p className='text-muted-foreground text-sm'>
              {t('loading_units')}
            </p>
          ) : userUnits.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('no_units_assigned')}
            </p>
          ) : (
            <Accordion
              type='multiple'
              className='w-full rounded-md border px-2'
            >
              {userUnits.map((uu) => {
                const rowPermissions = uu.permissions ?? [];
                const meta = unitsById.get(uu.unitId);
                const title =
                  getUnitDisplayName(
                    {
                      name: meta?.name ?? uu.unit?.name ?? '',
                      nameEn: meta?.nameEn ?? uu.unit?.nameEn
                    },
                    locale
                  ) || uu.unitId.slice(0, 8);
                const subtitle = meta?.code ?? uu.unit?.code ?? '';
                const canManage = canManageUnitUsers(
                  currentUser as User | undefined,
                  uu.unitId
                );
                return (
                  <AccordionItem key={uu.id} value={uu.id}>
                    <div className='flex w-full min-w-0 items-center justify-between gap-3'>
                      {/*
                        Trigger must stay content-sized on the left (title + chevron),
                        while the row uses justify-between so Delete stays on the right.
                        Override default justify-between inside the trigger so the chevron
                        sits next to the title, not at the end of the full-width trigger.
                      */}
                      <AccordionTrigger className='min-w-0 flex-1 !items-center justify-start gap-2 py-3 [&>svg]:translate-y-0'>
                        <span className='min-w-0 truncate text-left'>
                          {title}
                          {subtitle ? (
                            <span className='text-muted-foreground'>
                              {' '}
                              ({subtitle})
                            </span>
                          ) : null}
                        </span>
                      </AccordionTrigger>
                      {canManage ? (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='text-destructive shrink-0'
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveUnit(uu.unitId);
                          }}
                          disabled={removeMutation.isPending}
                        >
                          {t('remove')}
                        </Button>
                      ) : null}
                    </div>
                    <AccordionContent>
                      {canManage ? (
                        <div className='border-muted space-y-3 border-t pt-3'>
                          <p className='text-muted-foreground text-xs'>
                            {t('permissions')}
                          </p>
                          <div className='grid gap-2'>
                            {UNIT_PERMISSIONS.map((permission) => (
                              <div
                                key={permission.id}
                                className='flex items-center gap-2'
                              >
                                <Checkbox
                                  id={`${uu.id}-${permission.id}`}
                                  checked={rowPermissions.includes(
                                    permission.id
                                  )}
                                  onCheckedChange={() =>
                                    toggleAssignedPermission(uu, permission.id)
                                  }
                                  disabled={assignMutation.isPending}
                                />
                                <Label
                                  htmlFor={`${uu.id}-${permission.id}`}
                                  className='cursor-pointer font-normal'
                                >
                                  {getPermissionLabel(permission.id)}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className='text-muted-foreground text-xs'>
                          {t('no_permission_to_manage_unit')}
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </section>

        <Separator />

        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('add_unit_section')}</h3>
          <Input
            placeholder={t('search_units')}
            value={searchAvailable}
            onChange={(e) => setSearchAvailable(e.target.value)}
          />
          <div className='max-h-52 space-y-2 overflow-y-auto rounded-md border p-2'>
            {filteredAvailable.length === 0 ? (
              <p className='text-muted-foreground px-1 py-2 text-sm'>
                {t('no_available_units')}
              </p>
            ) : (
              filteredAvailable.map((unit) => (
                <div key={unit.id}>
                  <div
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-2 rounded-md p-2',
                      assigningUnitId === unit.id && 'bg-muted/40'
                    )}
                  >
                    <span className='min-w-0 flex-1 text-sm'>
                      <span className='font-medium'>
                        {getUnitDisplayName(unit, locale)}
                      </span>
                      <span className='text-muted-foreground'>
                        {' '}
                        ({unit.code})
                      </span>
                    </span>
                    {canManageUnitUsers(
                      currentUser as User | undefined,
                      unit.id
                    ) ? (
                      <Button
                        type='button'
                        size='sm'
                        variant='secondary'
                        onClick={() => startAssign(unit.id)}
                      >
                        {t('assign')}
                      </Button>
                    ) : null}
                  </div>
                  {assigningUnitId === unit.id ? (
                    <div className='bg-muted/20 mt-2 space-y-3 rounded-md border p-3'>
                      <p className='text-muted-foreground text-xs'>
                        {t('assign_unit_desc')}
                      </p>
                      <div className='grid gap-2'>
                        {UNIT_PERMISSIONS.map((permission) => (
                          <div
                            key={permission.id}
                            className='flex items-center gap-2'
                          >
                            <Checkbox
                              id={`new-${unit.id}-${permission.id}`}
                              checked={assignPerms.includes(permission.id)}
                              onCheckedChange={() =>
                                toggleAssignPerm(permission.id)
                              }
                            />
                            <Label
                              htmlFor={`new-${unit.id}-${permission.id}`}
                              className='cursor-pointer font-normal'
                            >
                              {getPermissionLabel(permission.id)}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          type='button'
                          size='sm'
                          onClick={confirmAssign}
                          disabled={assignMutation.isPending}
                        >
                          {assignMutation.isPending
                            ? t('saving')
                            : t('save_permissions')}
                        </Button>
                        <Button
                          type='button'
                          size='sm'
                          variant='outline'
                          onClick={() => setAssigningUnitId(null)}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export interface UserSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  units: Unit[];
}

export function UserSettingsSheet({
  open,
  onOpenChange,
  user,
  units
}: UserSettingsSheetProps) {
  const t = useTranslations('admin.users');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg'
      >
        {!user ? (
          <SheetHeader>
            <SheetTitle>{t('sheet_title')}</SheetTitle>
          </SheetHeader>
        ) : (
          <UserSettingsSheetBody
            key={`${user.id}-${open}`}
            user={user}
            open={open}
            units={units}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
