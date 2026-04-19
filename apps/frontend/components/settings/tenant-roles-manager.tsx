'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import type { Unit } from '@quokkaq/shared-types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  getGetPermissionCatalogQueryKey,
  getListTenantRolesQueryKey,
  useCreateTenantRole,
  useDeleteTenantRole,
  useGetPermissionCatalog,
  useListTenantRoles,
  usePatchTenantRole,
  type HandlersCreateTenantRoleJSON,
  type ModelsTenantRole
} from '@/lib/api/generated/auth';
import { getUnitDisplayName } from '@/lib/unit-display';
import { isTenantSystemAdminSlug } from '@/lib/tenant-roles';
import { cn } from '@/lib/utils';

type UnitRow = Pick<Unit, 'id' | 'name' | 'nameEn'>;

export type TenantRolesManagerProps = {
  units: UnitRow[];
  /** `card` — full card with title (e.g. Integrations). `plain` — toolbar + table only (e.g. Users → Roles tab). */
  variant?: 'card' | 'plain';
};

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function rbacPermMessageId(perm: string) {
  return `perm_${perm.replace(/\./g, '_')}`;
}

/** Visible unit name tags in the roles table; remainder collapsed to +N. */
const MAX_VISIBLE_UNIT_TAGS = 2;

function tenantRoleUnitTagEntries(
  role: ModelsTenantRole,
  unitsCatalog: UnitRow[],
  locale: string
): { unitId: string; label: string }[] {
  return (role.units ?? [])
    .map((u) => {
      const uid = u.unitId?.trim();
      if (!uid) return null;
      const meta = unitsCatalog.find((x) => x.id === uid);
      const label = meta
        ? getUnitDisplayName(meta, locale)
        : uid.length > 10
          ? `${uid.slice(0, 8)}…`
          : uid;
      return { unitId: uid, label };
    })
    .filter((x): x is { unitId: string; label: string } => x != null);
}

export function TenantRolesManager({
  units,
  variant = 'card'
}: TenantRolesManagerProps) {
  const t = useTranslations('admin.integrations.rbac');
  const locale = useLocale();
  const qc = useQueryClient();

  const permQ = useGetPermissionCatalog();
  const rolesQ = useListTenantRoles();

  const permissions = useMemo(
    () => (permQ.data?.status === 200 ? (permQ.data.data ?? []) : []),
    [permQ.data]
  );

  const roles = useMemo(
    () => (rolesQ.data?.status === 200 ? (rolesQ.data.data ?? []) : []),
    [rolesQ.data]
  );

  const invalidateTenantRoles = () => {
    void qc.invalidateQueries({
      queryKey: getGetPermissionCatalogQueryKey()
    });
    void qc.invalidateQueries({
      queryKey: getListTenantRolesQueryKey()
    });
  };

  const createRole = useCreateTenantRole({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 201) {
          toast.success(t('role_created'));
          invalidateTenantRoles();
          setRoleOpen(false);
          resetRoleForm();
        } else toast.error(t('role_save_error'));
      },
      onError: () => toast.error(t('role_save_error'))
    }
  });

  const patchRole = usePatchTenantRole({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          toast.success(t('role_updated'));
          invalidateTenantRoles();
          setRoleOpen(false);
          resetRoleForm();
        } else toast.error(t('role_save_error'));
      },
      onError: () => toast.error(t('role_save_error'))
    }
  });

  const deleteRole = useDeleteTenantRole({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 204) {
          toast.success(t('role_deleted'));
          invalidateTenantRoles();
        } else toast.error(t('role_delete_error'));
      },
      onError: () => toast.error(t('role_delete_error'))
    }
  });

  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleSlug, setRoleSlug] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [unitPerms, setUnitPerms] = useState<Record<string, Set<string>>>({});

  const resetRoleForm = () => {
    setEditingRoleId(null);
    setRoleName('');
    setRoleSlug('');
    setRoleDesc('');
    setUnitPerms({});
  };

  const openCreateRole = () => {
    resetRoleForm();
    setRoleOpen(true);
  };

  const openEditRole = (r: ModelsTenantRole) => {
    setEditingRoleId(r.id ?? null);
    setRoleName(r.name ?? '');
    setRoleSlug(r.slug ?? '');
    setRoleDesc(r.description ?? '');
    const next: Record<string, Set<string>> = {};
    for (const u of r.units ?? []) {
      const uid = u.unitId ?? '';
      if (!uid) continue;
      next[uid] = new Set(u.permissions ?? []);
    }
    setUnitPerms(next);
    setRoleOpen(true);
  };

  const toggleUnit = (unitId: string, checked: boolean) => {
    setUnitPerms((prev) => {
      const copy = { ...prev };
      if (checked) {
        copy[unitId] = copy[unitId] ?? new Set();
      } else {
        delete copy[unitId];
      }
      return copy;
    });
  };

  const togglePerm = (unitId: string, perm: string, checked: boolean) => {
    setUnitPerms((prev) => {
      const set = new Set(prev[unitId] ?? []);
      if (checked) set.add(perm);
      else set.delete(perm);
      const copy = { ...prev, [unitId]: set };
      if (set.size === 0) delete copy[unitId];
      return copy;
    });
  };

  const buildRoleBody = (): HandlersCreateTenantRoleJSON => {
    const unitsPayload = Object.entries(unitPerms).map(([unitId, set]) => ({
      unitId,
      permissions: Array.from(set)
    }));
    return {
      name: roleName.trim(),
      slug: roleSlug.trim(),
      description: roleDesc.trim(),
      units: unitsPayload
    };
  };

  const submitRole = () => {
    const body = buildRoleBody();
    if (!body.name || !body.slug) {
      toast.error(t('role_name_slug_required'));
      return;
    }
    if (editingRoleId) {
      patchRole.mutate({ roleId: editingRoleId, data: body });
    } else {
      createRole.mutate({ data: body });
    }
  };

  const roleBusy = createRole.isPending || patchRole.isPending;

  const editingRole = editingRoleId
    ? roles.find((r) => r.id === editingRoleId)
    : undefined;
  const editingIsReservedSystem = isTenantSystemAdminSlug(editingRole?.slug);

  const loading = permQ.isLoading || rolesQ.isLoading;
  const loadError =
    !loading &&
    (permQ.isError ||
      rolesQ.isError ||
      permQ.data?.status !== 200 ||
      rolesQ.data?.status !== 200);

  if (variant === 'plain') {
    if (loading) {
      return (
        <div className='text-muted-foreground flex items-center gap-2 text-sm'>
          <Loader2 className='h-4 w-4 animate-spin' />
          {t('loading')}
        </div>
      );
    }
    if (loadError) {
      return <p className='text-destructive text-sm'>{t('load_error')}</p>;
    }
  }

  const toolbarAndTable =
    !loading && !loadError ? (
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button type='button' size='sm' onClick={openCreateRole}>
            <Plus className='mr-1 h-4 w-4' />
            {t('add_role')}
          </Button>
        </div>
        {roles.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {t('no_roles')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-[22%] min-w-[10rem]'>
                  {t('roles_table_role')}
                </TableHead>
                <TableHead className='w-[26%] min-w-[8rem]'>
                  {t('col_description')}
                </TableHead>
                <TableHead className='w-[32%] min-w-[10rem]'>
                  {t('col_units')}
                </TableHead>
                <TableHead className='w-[20%] min-w-[6rem] text-right'>
                  {t('roles_table_actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow
                  key={r.id}
                  data-state={
                    roleOpen && editingRoleId === r.id ? 'selected' : undefined
                  }
                  className={cn(
                    'cursor-pointer',
                    roleOpen && editingRoleId === r.id && 'bg-muted/50'
                  )}
                  onClick={() => openEditRole(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEditRole(r);
                    }
                  }}
                  tabIndex={0}
                  role='button'
                  aria-label={t('roles_row_edit_aria', {
                    name: r.name ?? r.slug ?? ''
                  })}
                >
                  <TableCell className='align-top'>
                    <div className='flex min-w-0 items-start gap-3'>
                      <Avatar size='sm' className='shrink-0'>
                        <AvatarFallback className='bg-primary/10'>
                          <Shield className='text-primary size-4' />
                        </AvatarFallback>
                      </Avatar>
                      <div className='min-w-0'>
                        <div className='truncate font-medium'>
                          {r.name ?? '—'}
                        </div>
                        <div className='text-muted-foreground truncate font-mono text-xs'>
                          {r.slug ?? '—'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className='align-top'>
                    {r.description?.trim() ? (
                      <p className='text-muted-foreground line-clamp-3 text-sm leading-snug'>
                        {r.description.trim()}
                      </p>
                    ) : (
                      <span className='text-muted-foreground text-sm'>—</span>
                    )}
                  </TableCell>
                  <TableCell className='align-top'>
                    {(() => {
                      const entries = tenantRoleUnitTagEntries(
                        r,
                        units,
                        locale
                      );
                      if (entries.length === 0) {
                        return (
                          <span className='text-muted-foreground text-sm'>
                            —
                          </span>
                        );
                      }
                      const visible = entries.slice(0, MAX_VISIBLE_UNIT_TAGS);
                      const extra = entries.length - visible.length;
                      return (
                        <div className='flex flex-wrap items-center gap-1.5'>
                          {visible.map(({ unitId, label }) => (
                            <Badge
                              key={unitId}
                              variant='outline'
                              className='border-primary/30 bg-primary/10 text-foreground dark:border-primary/40 dark:bg-primary/15 max-w-[min(100%,11rem)] truncate font-normal shadow-none'
                              title={label}
                            >
                              <span className='truncate'>{label}</span>
                            </Badge>
                          ))}
                          {extra > 0 ? (
                            <Badge
                              variant='outline'
                              className='border-primary/20 bg-primary/5 text-muted-foreground dark:border-primary/30 dark:bg-primary/10 shrink-0 font-normal shadow-none'
                            >
                              +{extra}
                            </Badge>
                          ) : null}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className='text-right align-top'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      aria-label={t('edit')}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditRole(r);
                      }}
                    >
                      <Pencil className='h-4 w-4' />
                    </Button>
                    {isTenantSystemAdminSlug(r.slug) ? null : (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='text-destructive'
                        aria-label={t('delete')}
                        disabled={deleteRole.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!r.id) return;
                          if (
                            typeof window !== 'undefined' &&
                            !window.confirm(t('confirm_delete_role'))
                          ) {
                            return;
                          }
                          deleteRole.mutate({ roleId: r.id });
                        }}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    ) : null;

  return (
    <>
      {variant === 'card' ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              {t('tenant_roles_title')}
            </CardTitle>
            <CardDescription>{t('tenant_roles_description')}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {loading ? (
              <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                <Loader2 className='h-4 w-4 animate-spin' />
                {t('loading')}
              </div>
            ) : loadError ? (
              <p className='text-destructive text-sm'>{t('load_error')}</p>
            ) : (
              toolbarAndTable
            )}
          </CardContent>
        </Card>
      ) : (
        toolbarAndTable
      )}

      <Sheet
        open={roleOpen}
        onOpenChange={(o) => {
          setRoleOpen(o);
          if (!o) resetRoleForm();
        }}
      >
        <SheetContent
          side='right'
          className='flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'
        >
          <SheetHeader className='shrink-0 space-y-1 border-b px-6 pt-2 pb-4'>
            <SheetTitle>
              {editingRoleId ? t('edit_role_title') : t('create_role_title')}
            </SheetTitle>
          </SheetHeader>
          <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
            <div className='space-y-3'>
              <div className='space-y-2'>
                <Label htmlFor='tr-name'>{t('role_name')}</Label>
                <Input
                  id='tr-name'
                  value={roleName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRoleName(v);
                    if (!editingRoleId) setRoleSlug(slugify(v));
                  }}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='tr-slug'>{t('role_slug')}</Label>
                <Input
                  id='tr-slug'
                  className='font-mono text-sm'
                  value={roleSlug}
                  onChange={(e) => setRoleSlug(slugify(e.target.value))}
                  disabled={editingIsReservedSystem}
                  title={
                    editingIsReservedSystem
                      ? t('reserved_role_slug_locked')
                      : undefined
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='tr-desc'>{t('role_description')}</Label>
                <Input
                  id='tr-desc'
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {editingIsReservedSystem
                  ? t('system_role_matrix_locked_hint')
                  : t('units_matrix_hint')}
              </p>
              <div className='space-y-3 pb-2'>
                {units.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('no_units')}
                  </p>
                ) : (
                  units.map((u) => {
                    const uid = u.id;
                    const active = Boolean(unitPerms[uid]);
                    return (
                      <div key={uid} className='min-w-0 rounded-md border p-3'>
                        <div className='flex items-center gap-2'>
                          <Checkbox
                            id={`unit-${uid}`}
                            checked={active}
                            onCheckedChange={(c) => toggleUnit(uid, c === true)}
                            disabled={editingIsReservedSystem}
                          />
                          <Label
                            htmlFor={`unit-${uid}`}
                            className='font-medium'
                          >
                            {getUnitDisplayName(u, locale)}
                          </Label>
                        </div>
                        {active ? (
                          <div
                            className='border-border/60 bg-muted/20 mt-3 max-h-56 min-h-0 overflow-y-auto overscroll-y-contain rounded-md border px-2 py-2'
                            role='group'
                            aria-label={t('perm_list_for_unit')}
                          >
                            <div className='grid gap-2'>
                              {permissions.map((perm) => {
                                const permMsg = rbacPermMessageId(perm);
                                return (
                                  <div
                                    key={perm}
                                    className='flex min-w-0 items-center gap-2'
                                  >
                                    <Checkbox
                                      id={`${uid}-${perm}`}
                                      className='shrink-0'
                                      checked={
                                        unitPerms[uid]?.has(perm) ?? false
                                      }
                                      onCheckedChange={(c) =>
                                        togglePerm(uid, perm, c === true)
                                      }
                                      disabled={editingIsReservedSystem}
                                    />
                                    <Label
                                      htmlFor={`${uid}-${perm}`}
                                      className='min-w-0 cursor-pointer leading-snug font-normal'
                                      title={perm}
                                    >
                                      {t.has(permMsg) ? t(permMsg) : perm}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <SheetFooter className='shrink-0 flex-row justify-end gap-2 border-t px-6 py-4'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setRoleOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button type='button' onClick={submitRole} disabled={roleBusy}>
              {roleBusy ? t('saving') : t('save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
