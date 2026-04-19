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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Trash2, Users } from 'lucide-react';
import type { Unit } from '@quokkaq/shared-types';
import {
  getGetCompaniesMeSsoGroupMappingsQueryKey,
  getGetCompaniesMeTenantRolesQueryKey,
  useDeleteCompaniesMeSsoGroupMappingsMappingId,
  useGetCompaniesMeSsoGroupMappings,
  useGetCompaniesMeTenantRoles,
  usePostCompaniesMeSsoGroupMappings
} from '@/lib/api/generated/auth';
import { TenantRolesManager } from '@/components/settings/tenant-roles-manager';

type UnitRow = Pick<Unit, 'id' | 'name' | 'nameEn'>;

type OrganizationTenantRbacSettingsProps = {
  units: UnitRow[];
};

export function OrganizationTenantRbacSettings({
  units
}: OrganizationTenantRbacSettingsProps) {
  const t = useTranslations('admin.integrations.rbac');
  const locale = useLocale();
  const qc = useQueryClient();

  const rolesQ = useGetCompaniesMeTenantRoles();
  const mapsQ = useGetCompaniesMeSsoGroupMappings();

  const roles = useMemo(
    () => (rolesQ.data?.status === 200 ? (rolesQ.data.data ?? []) : []),
    [rolesQ.data]
  );

  const mappings = useMemo(
    () => (mapsQ.data?.status === 200 ? (mapsQ.data.data ?? []) : []),
    [mapsQ.data]
  );

  const invalidateRbac = () => {
    void qc.invalidateQueries({
      queryKey: getGetCompaniesMeTenantRolesQueryKey()
    });
    void qc.invalidateQueries({
      queryKey: getGetCompaniesMeSsoGroupMappingsQueryKey()
    });
  };

  const upsertMapping = usePostCompaniesMeSsoGroupMappings({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 201) {
          toast.success(t('mapping_saved'));
          invalidateRbac();
          setNewMapIdp('');
          setNewMapRole('');
        } else toast.error(t('mapping_save_error'));
      },
      onError: () => toast.error(t('mapping_save_error'))
    }
  });

  const deleteMapping = useDeleteCompaniesMeSsoGroupMappingsMappingId({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 204) {
          toast.success(t('mapping_deleted'));
          invalidateRbac();
        } else toast.error(t('mapping_delete_error'));
      },
      onError: () => toast.error(t('mapping_delete_error'))
    }
  });

  const [newMapIdp, setNewMapIdp] = useState('');
  const [newMapRole, setNewMapRole] = useState('');

  const submitMapping = () => {
    const idp = newMapIdp.trim();
    if (!idp) {
      toast.error(t('mapping_idp_required'));
      return;
    }
    if (!newMapRole) {
      toast.error(t('mapping_role_required'));
      return;
    }
    upsertMapping.mutate({
      data: {
        idpGroupId: idp,
        tenantRoleId: newMapRole
      }
    });
  };

  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) {
      if (r.id) m.set(r.id, r.name ?? r.slug ?? r.id);
    }
    return m;
  }, [roles]);

  const sortedTenantRoles = useMemo(() => {
    return [...roles].sort((a, b) =>
      (a.name ?? a.slug ?? '').localeCompare(b.name ?? b.slug ?? '', locale, {
        sensitivity: 'base'
      })
    );
  }, [roles, locale]);

  const mappingTargetLabel = (m: {
    tenantRoleId?: string;
    legacyRoleName?: string;
  }) => {
    const tid = m.tenantRoleId?.trim();
    if (tid) {
      return roleNameById.get(tid) ?? tid;
    }
    const leg = m.legacyRoleName?.trim().toLowerCase();
    if (leg === 'admin') {
      return t('role_tenant_administrator');
    }
    if (leg) {
      return leg;
    }
    return '—';
  };

  const loading = rolesQ.isLoading || mapsQ.isLoading;

  if (loading) {
    return (
      <div className='text-muted-foreground flex items-center gap-2 text-sm'>
        <Loader2 className='h-4 w-4 animate-spin' />
        {t('loading')}
      </div>
    );
  }

  if (
    rolesQ.isError ||
    mapsQ.isError ||
    rolesQ.data?.status !== 200 ||
    mapsQ.data?.status !== 200
  ) {
    return <p className='text-destructive text-sm'>{t('load_error')}</p>;
  }

  return (
    <>
      <TenantRolesManager units={units} />

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Users className='h-5 w-5' />
            {t('group_mappings_title')}
          </CardTitle>
          <CardDescription>{t('group_mappings_description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 rounded-lg border p-3 md:grid-cols-2'>
            <div className='space-y-2 md:col-span-2'>
              <Label htmlFor='map-idp'>{t('idp_group_id')}</Label>
              <Input
                id='map-idp'
                value={newMapIdp}
                onChange={(e) => setNewMapIdp(e.target.value)}
                placeholder={t('idp_group_placeholder')}
              />
            </div>
            <div className='space-y-2 md:col-span-2'>
              <Label>{t('mapping_role_label')}</Label>
              <Select
                value={newMapRole || undefined}
                onValueChange={setNewMapRole}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('select_role')} />
                </SelectTrigger>
                <SelectContent>
                  {sortedTenantRoles.map((r) =>
                    r.id ? (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name ?? r.slug}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className='md:col-span-2'>
              <Button
                type='button'
                onClick={submitMapping}
                disabled={upsertMapping.isPending}
              >
                {upsertMapping.isPending ? t('saving') : t('add_mapping')}
              </Button>
            </div>
          </div>

          {mappings.length === 0 ? (
            <p className='text-muted-foreground text-sm'>{t('no_mappings')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('idp_group_id')}</TableHead>
                  <TableHead>{t('maps_to')}</TableHead>
                  <TableHead className='w-[80px]' />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => {
                  const target = mappingTargetLabel(m);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className='font-mono text-xs break-all'>
                        {m.idpGroupId}
                      </TableCell>
                      <TableCell>{target}</TableCell>
                      <TableCell className='text-right'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='text-destructive'
                          disabled={!m.id || deleteMapping.isPending}
                          aria-label={t('delete')}
                          onClick={() => {
                            if (!m.id) return;
                            if (
                              typeof window !== 'undefined' &&
                              !window.confirm(t('confirm_delete_mapping'))
                            ) {
                              return;
                            }
                            deleteMapping.mutate({ mappingId: m.id });
                          }}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
