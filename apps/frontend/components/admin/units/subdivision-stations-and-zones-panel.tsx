'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocale, useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, FolderOpen, Plus, ExternalLink } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { useCreateUnit, useUnits } from '@/lib/hooks';
import { Link, useRouter } from '@/src/i18n/navigation';
import { useAuthContext } from '@/contexts/AuthContext';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';
import { formatApiToastErrorMessage } from '@/lib/format-api-toast-error';
import { UnitCountersSection } from '@/components/admin/units/counters-list';
import {
  childUnitsQueryKey,
  childSubdivisionsQueryKey
} from '@/components/admin/units/unit-child-query-keys';
import { buildDescendantForest, type UnitTreeNode } from '@/lib/unit-tree';
import { unitKindBadgeClassName } from '@/components/admin/units/unit-kind-badge-styles';
import { cn } from '@/lib/utils';
import { getUnitDisplayName } from '@/lib/unit-display';
import { z } from 'zod';

type CreateKind = 'subdivision' | 'service_zone';

type CreateChildFormValues = {
  name: string;
  code: string;
};

function SubdivisionUnitsSubtree({
  nodes,
  depth,
  subdivisionId
}: {
  nodes: UnitTreeNode[];
  depth: number;
  subdivisionId: string;
}) {
  const t = useTranslations('admin.units');
  const locale = useLocale();
  const router = useRouter();

  return (
    <ul
      className={
        depth > 0 ? 'border-muted space-y-4 border-l pl-4' : 'space-y-6'
      }
    >
      {nodes.map(({ unit, children }) => (
        <li key={unit.id}>
          {unit.kind === 'service_zone' ? (
            <section className='bg-muted/25 space-y-4 rounded-lg border p-4'>
              <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between'>
                <div className='flex min-w-0 items-center gap-2'>
                  <FolderOpen
                    className='text-muted-foreground h-5 w-5 shrink-0'
                    aria-hidden
                  />
                  <span className='truncate font-semibold'>
                    {getUnitDisplayName(unit, locale)}
                  </span>
                  <Badge
                    variant='outline'
                    className={cn(
                      'shrink-0 text-xs',
                      unitKindBadgeClassName('service_zone')
                    )}
                  >
                    {t('kind_service_zone')}
                  </Badge>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full shrink-0 sm:w-auto sm:self-start'
                  asChild
                >
                  <Link href={`/settings/units/${unit.id}`}>
                    <ExternalLink className='mr-2 h-4 w-4' />
                    {t('open_service_zone_page')}
                  </Link>
                </Button>
              </div>
              <UnitCountersSection
                countersUnitId={unit.parentId ?? subdivisionId}
                serviceZoneFilter={unit.id}
                variant='embedded'
                hideEmbeddedHeading
              />
              {children.length > 0 ? (
                <SubdivisionUnitsSubtree
                  nodes={children}
                  depth={depth + 1}
                  subdivisionId={subdivisionId}
                />
              ) : null}
            </section>
          ) : (
            <section className='bg-card/50 space-y-3 rounded-lg border p-4'>
              <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between'>
                <div className='flex min-w-0 items-center gap-2'>
                  <Building2
                    className='text-muted-foreground h-5 w-5 shrink-0'
                    aria-hidden
                  />
                  <span className='truncate font-semibold'>
                    {getUnitDisplayName(unit, locale)}
                  </span>
                  <Badge
                    variant='outline'
                    className={cn(
                      'shrink-0 text-xs',
                      unitKindBadgeClassName('subdivision')
                    )}
                  >
                    {t('kind_subdivision')}
                  </Badge>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full shrink-0 sm:w-auto sm:self-start'
                  onClick={() => router.push(`/settings/units/${unit.id}`)}
                >
                  <ExternalLink className='mr-2 h-4 w-4' />
                  {t('open_child_unit')}
                </Button>
              </div>
              {children.length > 0 ? (
                <SubdivisionUnitsSubtree
                  nodes={children}
                  depth={depth + 1}
                  subdivisionId={subdivisionId}
                />
              ) : null}
            </section>
          )}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  subdivisionId: string;
  companyId: string;
  parentTimezone: string;
};

export function SubdivisionStationsAndZonesPanel({
  subdivisionId,
  companyId,
  parentTimezone
}: Props) {
  const t = useTranslations('admin.units');
  const tCommon = useTranslations('common');
  const tAdminGeneral = useTranslations('admin.general');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const createUnitMutation = useCreateUnit();
  const { user } = useAuthContext();

  const {
    data: allUnits = [],
    isLoading: unitsLoading,
    isError: unitsError,
    error: unitsErr
  } = useUnits();

  const childForest = useMemo(
    () => buildDescendantForest(subdivisionId, allUnits, locale),
    [subdivisionId, allUnits, locale]
  );

  const createChildFormSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, { message: t('unit_name_code_required') }),
        code: z
          .string()
          .trim()
          .min(1, { message: t('unit_name_code_required') })
      }),
    [t]
  );

  const form = useForm<CreateChildFormValues>({
    resolver: zodResolver(createChildFormSchema),
    defaultValues: { name: '', code: '' }
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>('service_zone');

  const openDialog = (kind: CreateKind) => {
    setCreateKind(kind);
    form.reset({ name: '', code: '' });
    setDialogOpen(true);
  };

  const invalidateChildQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: childUnitsQueryKey(subdivisionId)
    });
    await queryClient.invalidateQueries({
      queryKey: childSubdivisionsQueryKey(subdivisionId)
    });
  };

  const onCreateSubmit = form.handleSubmit(async (values) => {
    try {
      await createUnitMutation.mutateAsync({
        name: values.name,
        code: values.code,
        companyId,
        timezone: parentTimezone,
        kind: createKind,
        parentId: subdivisionId
      });
      await invalidateChildQueries();
      setDialogOpen(false);
      form.reset({ name: '', code: '' });
      toast.success(
        createKind === 'service_zone'
          ? t('child_service_zone_created')
          : t('child_subdivision_created')
      );
    } catch (error) {
      toast.error(
        t('create_error', {
          message: formatApiToastErrorMessage(error, tCommon('error'))
        })
      );
    }
  });

  return (
    <>
      <Card>
        <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
          <div className='space-y-1'>
            <CardTitle>{t('stations_and_zones_panel_title')}</CardTitle>
            <CardDescription className='max-w-3xl'>
              {t('stations_and_zones_panel_description')}
            </CardDescription>
          </div>
          {isTenantAdminUser(user) ? (
            <div className='flex shrink-0 flex-wrap gap-2'>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => openDialog('service_zone')}
              >
                <Plus className='mr-2 h-4 w-4' />
                {t('add_child_service_zone')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => openDialog('subdivision')}
              >
                <Plus className='mr-2 h-4 w-4' />
                {t('add_child_subdivision')}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className='space-y-10'>
          <section className='space-y-4'>
            <UnitCountersSection
              countersUnitId={subdivisionId}
              serviceZoneFilter={null}
              variant='embedded'
              embeddedHeading={t('counters_direct_on_subdivision_title')}
              embeddedDescription={t(
                'counters_direct_on_subdivision_description'
              )}
            />
          </section>

          {unitsLoading ? (
            <p className='text-muted-foreground text-sm'>
              {t('loading', { defaultValue: 'Loading...' })}
            </p>
          ) : unitsError ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('children_load_error', {
                message: formatApiToastErrorMessage(unitsErr, tCommon('error'))
              })}
            </p>
          ) : childForest.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('branch_children_empty')}
            </p>
          ) : (
            <section className='space-y-4'>
              <div>
                <h3 className='text-base font-semibold'>
                  {t('branch_tree_title')}
                </h3>
                <p className='text-muted-foreground mt-1 max-w-2xl text-sm'>
                  {t('branch_tree_description')}
                </p>
              </div>
              <SubdivisionUnitsSubtree
                nodes={childForest}
                depth={0}
                subdivisionId={subdivisionId}
              />
            </section>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            form.reset({ name: '', code: '' });
          }
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
          <Form {...form}>
            <form onSubmit={onCreateSubmit} className='grid gap-4 py-2'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor='subdiv-child-name'>
                      {t('unit_name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        id='subdiv-child-name'
                        autoComplete='off'
                        placeholder={t('name_placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor='subdiv-child-code'>
                      {t('code')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        id='subdiv-child-code'
                        autoComplete='off'
                        placeholder={t('code_placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className='gap-2 sm:gap-0'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setDialogOpen(false)}
                >
                  {tAdminGeneral('cancel')}
                </Button>
                <Button type='submit' disabled={createUnitMutation.isPending}>
                  {createUnitMutation.isPending
                    ? t('saving', { defaultValue: 'Saving...' })
                    : createKind === 'subdivision'
                      ? t('create_subdivision_submit')
                      : t('create_service_zone_submit')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
