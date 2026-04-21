'use client';

import { useMemo, useState } from 'react';
import { normalizeChildUnitsQueryData } from '@/lib/child-units-query';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { unitsApi } from '@/lib/api';
import { useCreateUnit } from '@/lib/hooks';
import { useRouter } from '@/src/i18n/navigation';
import PermissionGuard from '@/components/auth/permission-guard';
import { PermUnitSettingsManage } from '@/lib/permission-variants';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';
import { isQuotaExceededError } from '@/lib/quota-error';
import {
  childSubdivisionsQueryKey,
  childUnitsQueryKey
} from '@/components/admin/units/unit-child-query-keys';

type CreateKind = 'subdivision' | 'service_zone';

type Props = {
  parentUnitId: string;
  companyId: string;
  parentTimezone: string;
};

export function ServiceZoneWorkplacesPanel({
  parentUnitId,
  companyId,
  parentTimezone
}: Props) {
  const t = useTranslations('admin.units');
  const tCommon = useTranslations('common');
  const tAdminGeneral = useTranslations('admin.general');
  const router = useRouter();
  const queryClient = useQueryClient();
  const createUnitMutation = useCreateUnit();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>('service_zone');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const {
    data: children,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: childUnitsQueryKey(parentUnitId),
    queryFn: () => unitsApi.getChildUnits(parentUnitId)
  });

  const childrenList = useMemo(
    () => normalizeChildUnitsQueryData(children),
    [children]
  );

  const resetForm = () => {
    setName('');
    setCode('');
  };

  const openDialog = (kind: CreateKind) => {
    setCreateKind(kind);
    setDialogOpen(true);
  };

  const invalidateChildQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: childUnitsQueryKey(parentUnitId)
    });
    await queryClient.invalidateQueries({
      queryKey: childSubdivisionsQueryKey(parentUnitId)
    });
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName || !trimmedCode) {
      toast.error(t('unit_name_code_required'));
      return;
    }
    try {
      await createUnitMutation.mutateAsync({
        name: trimmedName,
        code: trimmedCode,
        companyId,
        timezone: parentTimezone,
        kind: createKind,
        parentId: parentUnitId
      });
      await invalidateChildQueries();
      setDialogOpen(false);
      resetForm();
      toast.success(
        createKind === 'service_zone'
          ? t('child_service_zone_created')
          : t('child_subdivision_created')
      );
    } catch (error) {
      if (isQuotaExceededError(error)) {
        toast.error(
          t('quota_exceeded_unit', {
            defaultValue:
              'Достигнут лимит тарифного плана. Обновите тариф, чтобы добавить ещё.'
          })
        );
      } else {
        toast.error(
          t('create_error', {
            message: formatApiToastErrorMessage(error, tCommon('error'))
          })
        );
      }
    }
  };

  const kindLabel = (u: { kind?: string }) =>
    u.kind === 'service_zone' ? t('kind_service_zone') : t('kind_subdivision');

  return (
    <>
      <Card>
        <CardHeader className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>{t('zone_children_title')}</CardTitle>
            <CardDescription className='mt-1 max-w-2xl'>
              {t('zone_children_description')}
            </CardDescription>
          </div>
          <PermissionGuard
            tenantAdminBypass
            permissions={[PermUnitSettingsManage]}
            unitId={parentUnitId}
            fallback={null}
          >
            <div className='flex shrink-0 flex-wrap gap-2'>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => openDialog('subdivision')}
              >
                <Plus className='mr-2 h-4 w-4' />
                {t('add_child_subdivision')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => openDialog('service_zone')}
              >
                <Plus className='mr-2 h-4 w-4' />
                {t('add_child_service_zone')}
              </Button>
            </div>
          </PermissionGuard>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className='text-muted-foreground text-sm'>{t('loading')}</p>
          ) : isError ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('children_load_error', {
                message: formatApiToastErrorMessage(error, tCommon('error'))
              })}
            </p>
          ) : childrenList.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('no_children_under_zone')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('unit_name')}</TableHead>
                  <TableHead>{t('code')}</TableHead>
                  <TableHead>{t('kind_column')}</TableHead>
                  <TableHead className='w-[200px]'>
                    {t('child_unit_actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {childrenList.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className='font-medium'>{u.name}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {u.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant='secondary' className='text-xs'>
                        {kindLabel(u)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => router.push(`/settings/units/${u.id}`)}
                      >
                        <ExternalLink className='mr-2 h-4 w-4' />
                        {t('open_child_unit')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {createKind === 'subdivision'
                ? t('create_subdivision_dialog_title')
                : t('create_service_zone_dialog_title')}
            </DialogTitle>
            <DialogDescription>
              {createKind === 'subdivision'
                ? t('create_subdivision_dialog_desc')
                : t('create_service_zone_dialog_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>
            <div className='space-y-2'>
              <Label htmlFor='child-name'>{t('unit_name')}</Label>
              <Input
                id='child-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name_placeholder')}
                autoFocus
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='child-code'>{t('code')}</Label>
              <Input
                id='child-code'
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('code_placeholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDialogOpen(false)}>
              {tAdminGeneral('cancel')}
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={createUnitMutation.isPending}
            >
              {createUnitMutation.isPending
                ? t('saving')
                : createKind === 'subdivision'
                  ? t('create_subdivision_submit')
                  : t('create_service_zone_submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
