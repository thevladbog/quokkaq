'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUnits, useCreateUnit } from '@/lib/hooks';
import { companiesApiExt } from '@/lib/api';
import PermissionGuard from '@/components/auth/permission-guard';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';
import { toast } from 'sonner';
import type { UnitKind } from '@quokkaq/shared-types';
import { buildUnitForest } from '@/lib/unit-tree';
import { UnitTreeNavList } from '@/components/admin/units/unit-tree-nav';

const PARENT_NONE = '__none__';

export default function UnitsIndexPage() {
  const { data: units = [], isLoading } = useUnits();
  const createUnitMutation = useCreateUnit();
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const { user } = useAuthContext();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newUnitKind, setNewUnitKind] = useState<UnitKind>('subdivision');
  const [newParentId, setNewParentId] = useState<string>(PARENT_NONE);

  const companyIdFromUnitsList = useMemo(
    () => units.find((u) => u.companyId)?.companyId ?? '',
    [units]
  );

  const companyIdFromUser = useMemo(
    () =>
      user?.units?.find(
        (a: { unit?: { companyId?: string } }) => a.unit?.companyId
      )?.unit?.companyId ?? '',
    [user?.units]
  );

  const { data: companyMe, isFetching: isFetchingCompanyMe } = useQuery({
    queryKey: ['companies', 'me', 'for-units-page'],
    queryFn: () => companiesApiExt.getMe(),
    enabled: !isLoading && !companyIdFromUnitsList && !companyIdFromUser
  });

  const companyId =
    companyIdFromUnitsList || companyIdFromUser || companyMe?.company?.id || '';

  const parentCandidates = useMemo(
    () =>
      units.filter(
        (u) =>
          u.companyId === companyId &&
          (u.kind === 'service_zone' || u.kind === 'subdivision')
      ),
    [units, companyId]
  );

  const unitForest = useMemo(() => buildUnitForest(units), [units]);

  const resetCreateForm = () => {
    setNewUnitName('');
    setNewUnitCode('');
    setNewUnitKind('subdivision');
    setNewParentId(PARENT_NONE);
  };

  const handleCreateUnit = async () => {
    if (!companyId) {
      toast.error(t('units.company_id_required'));
      return;
    }
    try {
      const hasParent = newParentId !== PARENT_NONE && newParentId !== '';
      const parentUnit = hasParent
        ? units.find((u) => u.id === newParentId)
        : undefined;
      const timezone =
        hasParent && parentUnit
          ? parentUnit.timezone
          : (units[0]?.timezone ?? 'UTC');

      await createUnitMutation.mutateAsync({
        name: newUnitName,
        code: newUnitCode,
        companyId,
        timezone,
        kind: newUnitKind,
        parentId:
          newParentId === PARENT_NONE || newParentId === '' ? null : newParentId
      });
      setCreateDialogOpen(false);
      resetCreateForm();
      toast.success(t('units.create_success'));
    } catch (error) {
      console.error('Failed to create unit:', error);
      toast.error(
        t('units.create_error', {
          message: formatApiToastErrorMessage(error, tCommon('error'))
        })
      );
    }
  };

  if (isLoading) {
    return <div className='container mx-auto p-4'>{t('units.loading')}</div>;
  }

  return (
    <div className='container mx-auto p-4'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-3xl font-bold'>
          {t('units.title', { defaultValue: 'Units' })}
        </h1>
        <PermissionGuard permissions={['UNIT_CREATE']}>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            disabled={!companyId || isLoading || isFetchingCompanyMe}
          >
            <Plus className='mr-2 h-4 w-4' />
            {t('units.add')}
          </Button>
        </PermissionGuard>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{t('units.tree_hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className='text-muted-foreground py-6 text-center'>
              {t('units.no_units')}
            </p>
          ) : (
            <UnitTreeNavList nodes={unitForest} />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className='sm:max-w-[425px]'>
          <DialogHeader>
            <DialogTitle>{t('units.create_title')}</DialogTitle>
            <DialogDescription>{t('units.create_desc')}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='name'>{t('units.name')}</Label>
              <Input
                id='name'
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder={t('units.name_placeholder')}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='code'>{t('units.code')}</Label>
              <Input
                id='code'
                value={newUnitCode}
                onChange={(e) => setNewUnitCode(e.target.value)}
                placeholder={t('units.code_placeholder')}
              />
            </div>
            <div className='space-y-2'>
              <Label>{t('units.kind')}</Label>
              <Select
                value={newUnitKind}
                onValueChange={(v) => setNewUnitKind(v as UnitKind)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='subdivision'>
                    {t('units.kind_subdivision')}
                  </SelectItem>
                  <SelectItem value='service_zone'>
                    {t('units.kind_service_zone')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>{t('units.parent_subdivision_or_zone')}</Label>
              <Select value={newParentId} onValueChange={setNewParentId}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PARENT_NONE}>
                    {t('units.parent_none')}
                  </SelectItem>
                  {parentCandidates.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name} ({z.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className='text-muted-foreground text-xs leading-relaxed'>
              {t('units.create_hierarchy_hint')}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setCreateDialogOpen(false)}
            >
              {t('general.cancel')}
            </Button>
            <Button
              onClick={handleCreateUnit}
              disabled={createUnitMutation.isPending || !companyId}
            >
              {createUnitMutation.isPending
                ? t('general.creating')
                : t('units.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
