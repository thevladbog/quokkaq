'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  useAssignUserToUnit,
  useCurrentUser,
  usePatchUserTenantRoles,
  useRemoveUserFromUnit,
  useUpdateUser,
  useUserUnits
} from '@/lib/hooks';
import {
  getGetExternalIdentityQueryKey,
  useCompaniesMeSSOGet,
  useGetExternalIdentity,
  useListTenantRoles,
  usePatchExternalIdentity,
  usePatchUserSSOFlags
} from '@/lib/api/generated/auth';
import { UNIT_PERMISSIONS } from '@/lib/unit-permissions';
import { cn } from '@/lib/utils';
import { getUnitDisplayName } from '@/lib/unit-display';
import { toast } from 'sonner';
import { isTenantSystemAdminSlug } from '@/lib/tenant-roles';

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
  const qc = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const viewerIsGlobalAdmin = currentUser?.roles?.includes('admin');
  const ssoSettingsQ = useCompaniesMeSSOGet({
    query: { enabled: open && !!viewerIsGlobalAdmin }
  });
  const showSsoDirectoryBlock =
    !!viewerIsGlobalAdmin &&
    ssoSettingsQ.data?.status === 200 &&
    ssoSettingsQ.data.data?.enabled === true;

  const [editName, setEditName] = useState(user.name);
  const [searchAvailable, setSearchAvailable] = useState('');
  const [searchTenantRoles, setSearchTenantRoles] = useState('');
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
  const patchTenantRoles = usePatchUserTenantRoles();

  const rolesCatalogQ = useListTenantRoles({
    query: { enabled: open }
  });
  const tenantRolesCatalog = useMemo(
    () =>
      rolesCatalogQ.data?.status === 200 ? (rolesCatalogQ.data.data ?? []) : [],
    [rolesCatalogQ.data]
  );
  const showTenantRolesBlock =
    open && rolesCatalogQ.isSuccess && rolesCatalogQ.data?.status === 200;

  const filteredTenantRolesCatalog = useMemo(() => {
    const q = searchTenantRoles.trim().toLowerCase();
    if (!q) {
      return tenantRolesCatalog;
    }
    return tenantRolesCatalog.filter((r) => {
      const name = (r.name ?? '').toLowerCase();
      const slug = (r.slug ?? '').toLowerCase();
      return name.includes(q) || slug.includes(q);
    });
  }, [tenantRolesCatalog, searchTenantRoles]);

  const selectedTenantIds = useMemo(
    () => new Set((user.tenantRoles ?? []).map((r) => r.id)),
    [user.tenantRoles]
  );

  const viewerCanAssignSystemTenantRole =
    currentUser?.roles?.includes('platform_admin') ||
    currentUser?.roles?.includes('admin') ||
    (currentUser?.tenantRoles ?? []).some((r) =>
      isTenantSystemAdminSlug(r.slug)
    );

  const targetHasSystemTenantAdmin = (user.tenantRoles ?? []).some((r) =>
    isTenantSystemAdminSlug(r.slug)
  );

  const toggleTenantRole = async (
    roleId: string,
    roleSlug: string | undefined,
    checked: boolean
  ) => {
    let next = new Set(selectedTenantIds);
    const sysCatalog = tenantRolesCatalog.find((r) =>
      isTenantSystemAdminSlug(r.slug)
    );
    if (isTenantSystemAdminSlug(roleSlug)) {
      if (checked) {
        next = new Set(roleId ? [roleId] : []);
      } else {
        next.delete(roleId);
      }
    } else {
      if (checked) {
        if (sysCatalog?.id) next.delete(sysCatalog.id);
        next.add(roleId);
      } else {
        next.delete(roleId);
      }
    }
    try {
      await patchTenantRoles.mutateAsync({
        userId: user.id,
        tenantRoleIds: Array.from(next)
      });
      toast.success(t('tenant_roles_saved'));
    } catch {
      toast.error(t('tenant_roles_error'));
    }
  };

  const patchSsoFlags = usePatchUserSSOFlags({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          void qc.invalidateQueries({ queryKey: ['users'] });
          toast.success(t('sso_flags_saved'));
        } else {
          toast.error(t('sso_flags_error'));
        }
      },
      onError: () => toast.error(t('sso_flags_error'))
    }
  });

  const patchExternalId = usePatchExternalIdentity({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          void qc.invalidateQueries({ queryKey: ['users'] });
          void qc.invalidateQueries({
            queryKey: getGetExternalIdentityQueryKey(user.id)
          });
          toast.success(t('sso_external_saved'));
          if (res.data) {
            setExtIssuer(res.data.issuer ?? '');
            setExtSubject(res.data.subject ?? '');
            setExtOid(res.data.externalObjectId ?? '');
          }
        } else if (res.status === 404) {
          toast.error(t('sso_external_not_found'));
        } else {
          toast.error(t('sso_external_error'));
        }
      },
      onError: () => toast.error(t('sso_external_error'))
    }
  });

  const [exemptSync, setExemptSync] = useState(
    () => user.exemptFromSsoSync ?? false
  );
  const [profileOptOut, setProfileOptOut] = useState(
    () => user.ssoProfileSyncOptOut ?? false
  );
  const [extIssuer, setExtIssuer] = useState('');
  const [extSubject, setExtSubject] = useState('');
  const [extOid, setExtOid] = useState('');
  const [ssoExternalAccordion, setSsoExternalAccordion] = useState<string>('');

  const extIdentityQ = useGetExternalIdentity(user.id, {
    query: {
      enabled:
        showSsoDirectoryBlock &&
        open &&
        !!user.id &&
        ssoExternalAccordion === 'sso-external'
    }
  });

  const hydratedExtIdentityRef = useRef(false);
  useEffect(() => {
    hydratedExtIdentityRef.current = false;
  }, [user.id]);

  useEffect(() => {
    if (hydratedExtIdentityRef.current) {
      return;
    }
    const res = extIdentityQ.data;
    if (!res || res.status !== 200 || !res.data) {
      return;
    }
    const d = res.data;
    setExtIssuer(d.issuer ?? '');
    setExtSubject(d.subject ?? '');
    setExtOid(d.externalObjectId ?? '');
    hydratedExtIdentityRef.current = true;
  }, [extIdentityQ.data]);

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

  /** Global roles with org-wide access; unit/tenant-role matrices are not applied. */
  const isFullAccessGlobalRole =
    user?.roles?.includes('admin') ||
    user?.roles?.includes('platform_admin') ||
    targetHasSystemTenantAdmin;
  /** Tenant roles drive user_units via sync; manual per-unit permissions would collide. */
  const hasTenantRoles = (user.tenantRoles?.length ?? 0) > 0;
  const unitManualAccessLocked = isFullAccessGlobalRole || hasTenantRoles;

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

        {showTenantRolesBlock && tenantRolesCatalog.length > 0 ? (
          <>
            <Separator />
            <section className='space-y-3'>
              <h3 className='text-sm font-medium'>
                {t('tenant_roles_section')}
              </h3>
              {isFullAccessGlobalRole ? (
                <p className='text-muted-foreground text-xs'>
                  {t('global_role_access_locked_hint')}
                </p>
              ) : null}
              <Input
                type='search'
                placeholder={t('search_tenant_roles')}
                value={searchTenantRoles}
                onChange={(e) => setSearchTenantRoles(e.target.value)}
                className='bg-background'
                autoComplete='off'
              />
              <div className='bg-muted/20 space-y-3 rounded-lg border p-4'>
                {filteredTenantRolesCatalog.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('tenant_roles_search_empty')}
                  </p>
                ) : (
                  filteredTenantRolesCatalog.map((role) =>
                    role.id ? (
                      <div
                        key={role.id}
                        className={cn(
                          'flex gap-2',
                          isTenantSystemAdminSlug(role.slug) &&
                            !viewerCanAssignSystemTenantRole
                            ? 'items-start'
                            : 'items-center'
                        )}
                      >
                        <Checkbox
                          id={`tr-${user.id}-${role.id}`}
                          className={
                            isTenantSystemAdminSlug(role.slug) &&
                            !viewerCanAssignSystemTenantRole
                              ? 'mt-0.5 shrink-0'
                              : 'shrink-0'
                          }
                          checked={selectedTenantIds.has(role.id)}
                          onCheckedChange={(c) => {
                            const rid = role.id as string;
                            void toggleTenantRole(rid, role.slug, c === true);
                          }}
                          disabled={
                            patchTenantRoles.isPending ||
                            isFullAccessGlobalRole ||
                            (isTenantSystemAdminSlug(role.slug) &&
                              !viewerCanAssignSystemTenantRole) ||
                            (targetHasSystemTenantAdmin &&
                              !isTenantSystemAdminSlug(role.slug))
                          }
                        />
                        <div className='min-w-0'>
                          <Label
                            htmlFor={`tr-${user.id}-${role.id}`}
                            className='cursor-pointer font-normal'
                          >
                            {role.name ?? role.slug}
                          </Label>
                          {isTenantSystemAdminSlug(role.slug) &&
                          !viewerCanAssignSystemTenantRole ? (
                            <p className='text-muted-foreground mt-0.5 text-xs'>
                              {t('tenant_system_role_assign_forbidden_hint')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null
                  )
                )}
              </div>
            </section>
          </>
        ) : null}

        <Separator />

        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('units_section')}</h3>
          {isFullAccessGlobalRole ? (
            <p className='text-muted-foreground text-xs'>
              {t('global_role_access_locked_hint')}
            </p>
          ) : hasTenantRoles ? (
            <p className='text-muted-foreground text-xs'>
              {t('tenant_roles_units_locked_hint')}
            </p>
          ) : null}
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
                      {canManage && !unitManualAccessLocked ? (
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
                      {canManage && !unitManualAccessLocked ? (
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
                                  disabled={
                                    assignMutation.isPending ||
                                    unitManualAccessLocked
                                  }
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
                      ) : unitManualAccessLocked && canManage ? (
                        <p className='text-muted-foreground text-xs'>
                          {isFullAccessGlobalRole
                            ? t('global_role_access_locked_hint')
                            : t('tenant_roles_units_locked_hint')}
                        </p>
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
                    ) && !unitManualAccessLocked ? (
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

        {showSsoDirectoryBlock ? (
          <>
            <Separator />
            <section className='space-y-3'>
              <h3 className='text-sm font-medium'>
                {t('sso_directory_section')}
              </h3>
              <p className='text-muted-foreground text-xs'>
                {t('sso_directory_hint')}
              </p>
              <div className='bg-muted/20 flex flex-col gap-4 rounded-lg border p-4'>
                <div className='flex items-center justify-between gap-4'>
                  <div>
                    <p className='font-medium'>{t('exempt_sso_sync')}</p>
                    <p className='text-muted-foreground text-sm'>
                      {t('exempt_sso_sync_desc')}
                    </p>
                  </div>
                  <Switch
                    checked={exemptSync}
                    onCheckedChange={(checked) => {
                      setExemptSync(checked);
                      patchSsoFlags.mutate({
                        userId: user.id,
                        data: { exemptFromSsoSync: checked }
                      });
                    }}
                    disabled={patchSsoFlags.isPending}
                    aria-label={t('exempt_sso_sync')}
                  />
                </div>
                <div className='flex items-center justify-between gap-4'>
                  <div>
                    <p className='font-medium'>{t('sso_profile_opt_out')}</p>
                    <p className='text-muted-foreground text-sm'>
                      {t('sso_profile_opt_out_desc')}
                    </p>
                  </div>
                  <Switch
                    checked={profileOptOut}
                    onCheckedChange={(checked) => {
                      setProfileOptOut(checked);
                      patchSsoFlags.mutate({
                        userId: user.id,
                        data: { ssoProfileSyncOptOut: checked }
                      });
                    }}
                    disabled={patchSsoFlags.isPending}
                    aria-label={t('sso_profile_opt_out')}
                  />
                </div>
              </div>
            </section>
            <Separator />
            <section className='space-y-3'>
              <Accordion
                type='single'
                collapsible
                value={ssoExternalAccordion}
                onValueChange={setSsoExternalAccordion}
                className='bg-muted/20 rounded-lg border'
              >
                <AccordionItem value='sso-external' className='border-0'>
                  <AccordionTrigger className='px-4 py-3 text-sm font-medium hover:no-underline'>
                    {t('sso_external_section')}
                  </AccordionTrigger>
                  <AccordionContent className='text-muted-foreground space-y-4 px-4 pb-4'>
                    <p className='text-xs'>{t('sso_external_hint')}</p>
                    {extIdentityQ.isFetching ? (
                      <p className='text-muted-foreground text-xs'>
                        {t('sso_external_loading')}
                      </p>
                    ) : null}
                    {extIdentityQ.isError ? (
                      <p className='text-destructive text-xs'>
                        {t('sso_external_fetch_error')}
                      </p>
                    ) : null}
                    <div className='flex flex-col gap-4'>
                      <div className='space-y-2'>
                        <Label htmlFor={`ext-iss-${user.id}`}>
                          {t('sso_issuer')}
                        </Label>
                        <Input
                          id={`ext-iss-${user.id}`}
                          value={extIssuer}
                          onChange={(e) => setExtIssuer(e.target.value)}
                          className='font-mono text-xs'
                          autoComplete='off'
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor={`ext-sub-${user.id}`}>
                          {t('sso_subject')}
                        </Label>
                        <Input
                          id={`ext-sub-${user.id}`}
                          value={extSubject}
                          onChange={(e) => setExtSubject(e.target.value)}
                          className='font-mono text-xs'
                          autoComplete='off'
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor={`ext-oid-${user.id}`}>
                          {t('sso_object_id')}
                        </Label>
                        <Input
                          id={`ext-oid-${user.id}`}
                          value={extOid}
                          onChange={(e) => setExtOid(e.target.value)}
                          className='font-mono text-xs'
                          autoComplete='off'
                        />
                      </div>
                    </div>
                    <Button
                      type='button'
                      size='sm'
                      className='mt-2 self-start'
                      disabled={patchExternalId.isPending}
                      onClick={() => {
                        const body: {
                          issuer?: string;
                          subject?: string;
                          externalObjectId?: string;
                        } = {};
                        if (extIssuer.trim() !== '')
                          body.issuer = extIssuer.trim();
                        if (extSubject.trim() !== '')
                          body.subject = extSubject.trim();
                        if (extOid.trim() !== '')
                          body.externalObjectId = extOid.trim();
                        if (Object.keys(body).length === 0) {
                          toast.error(t('sso_external_empty'));
                          return;
                        }
                        patchExternalId.mutate({ userId: user.id, data: body });
                      }}
                    >
                      {patchExternalId.isPending
                        ? t('saving')
                        : t('sso_external_save')}
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>
          </>
        ) : null}
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
