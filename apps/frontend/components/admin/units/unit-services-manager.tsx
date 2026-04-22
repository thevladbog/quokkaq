'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  useUnits,
  useUnitServices,
  useCreateService,
  useUpdateService,
  useDeleteService
} from '@/lib/hooks';
import { normalizeChildUnitsQueryData } from '@/lib/child-units-query';
import { getGetUnitsUnitIdChildUnitsQueryKey } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { getUnitDisplayName } from '@/lib/unit-display';
import { ImageUpload } from '@/components/ui/image-upload';
import { logger } from '@/lib/logger';
import { isQuotaExceededError } from '@/lib/quota-error';
import {
  buildServiceTree,
  filterServiceTree,
  type ServiceNode,
  type ServiceZoneFilter
} from '@/lib/service-tree';
import { cn, serviceTitleForLocale } from '@/lib/utils';
import type { Service } from '@quokkaq/shared-types';
import type { LucideIcon } from 'lucide-react';
import {
  Clock,
  Gauge,
  Pencil,
  Plus,
  Ticket,
  Timer,
  Trash2,
  X
} from 'lucide-react';
import { FolderIcon } from '@/src/components/ui/icons/akar-icons-folder';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface UnitServicesManagerProps {
  unitId: string;
}

const UNIT_SERVICES_TABLE_COL_COUNT = 7;

export function UnitServicesManager({ unitId }: UnitServicesManagerProps) {
  const [selectedUnitId] = useState<string>(unitId);

  const { data: units = [] } = useUnits();
  const {
    data: services = [],
    isLoading: servicesLoading,
    refetch
  } = useUnitServices(selectedUnitId);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formIsDirty, setFormIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState<ServiceZoneFilter>('all');

  const deleteServiceMutation = useDeleteService();

  const tServices = useTranslations('admin.services');
  const tRoot = useTranslations();
  const tStats = useTranslations('statistics');
  const locale = useLocale();

  const { data: childUnitsRaw } = useQuery({
    queryKey: getGetUnitsUnitIdChildUnitsQueryKey(selectedUnitId),
    queryFn: () => unitsApi.getChildUnits(selectedUnitId),
    enabled: !!selectedUnitId
  });

  const serviceZones = useMemo(
    () =>
      normalizeChildUnitsQueryData(childUnitsRaw).filter(
        (u) => u.kind === 'service_zone'
      ),
    [childUnitsRaw]
  );

  const zoneNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of serviceZones) {
      if (z.id) m.set(z.id, getUnitDisplayName(z, locale));
    }
    return m;
  }, [serviceZones, locale]);

  const confirmDiscardIfDirty = useCallback(() => {
    if (!formIsDirty) {
      return true;
    }
    return confirm(tServices('unsaved_discard_confirm'));
  }, [formIsDirty, tServices]);

  const handleEdit = (service: Service) => {
    if (!confirmDiscardIfDirty()) {
      return;
    }
    setEditingService(service);
    setIsCreating(false);
  };

  const handleDelete = async (serviceId: string) => {
    if (
      confirm(
        tServices('delete_confirm', {
          defaultValue: 'Are you sure you want to delete this service?'
        })
      )
    ) {
      try {
        await deleteServiceMutation.mutateAsync({ id: serviceId });
        refetch();
      } catch (error) {
        console.error('Error deleting service:', error);
      }
    }
  };

  const handleCancel = () => {
    if (!confirmDiscardIfDirty()) {
      return;
    }
    setEditingService(null);
    setIsCreating(false);
    setFormIsDirty(false);
  };

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);

  const serviceTree = useMemo(
    () => buildServiceTree(services, locale),
    [services, locale]
  );

  const filteredTree = useMemo(
    () => filterServiceTree(serviceTree, locale, searchQuery, zoneFilter),
    [serviceTree, locale, searchQuery, zoneFilter]
  );

  const sheetOpen = editingService !== null || isCreating;

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  return (
    <div className='w-full min-w-0'>
      <Card>
        <CardHeader>
          <CardTitle>{tServices('title')}</CardTitle>
          <CardDescription>
            {tServices('description', {
              unit: selectedUnit
                ? getUnitDisplayName(selectedUnit, locale)
                : 'selected unit'
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='mb-4 flex flex-wrap items-end gap-3'>
            <div className='min-w-[12rem] flex-1 space-y-1.5'>
              <Label htmlFor='services-search' className='sr-only'>
                {tServices('search_placeholder')}
              </Label>
              <Input
                id='services-search'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tServices('search_placeholder')}
                className='max-w-md'
              />
            </div>
            {serviceZones.length > 0 ? (
              <div className='min-w-[10rem] space-y-1.5'>
                <Label htmlFor='services-zone-filter' className='text-xs'>
                  {tServices('filter_zone_label')}
                </Label>
                <Select
                  value={zoneFilter}
                  onValueChange={(v) => setZoneFilter(v as ServiceZoneFilter)}
                >
                  <SelectTrigger
                    id='services-zone-filter'
                    className='w-[220px]'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>
                      {tServices('filter_zone_all')}
                    </SelectItem>
                    <SelectItem value='__unassigned__'>
                      {tServices('filter_zone_unassigned')}
                    </SelectItem>
                    {serviceZones
                      .filter(
                        (z): z is typeof z & { id: string } =>
                          typeof z.id === 'string' && z.id.trim().length > 0
                      )
                      .map((z) => (
                        <SelectItem key={z.id} value={z.id}>
                          {getUnitDisplayName(z, locale)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              className='shrink-0'
              onClick={() => {
                if (!confirmDiscardIfDirty()) {
                  return;
                }
                setIsCreating(true);
                setEditingService(null);
              }}
            >
              {tServices('add_new')}
            </Button>
          </div>

          <Table className='table-fixed'>
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '88px' }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>{tServices('name')}</TableHead>
                <TableHead>{tServices('column_zone')}</TableHead>
                <TableHead>{tServices('ticket_prefix')}</TableHead>
                <TableHead className='whitespace-normal'>
                  {tServices('column_max_wait')}
                </TableHead>
                <TableHead className='whitespace-normal'>
                  {tServices('column_avg_service')}
                </TableHead>
                <TableHead className='whitespace-normal'>
                  {tServices('column_max_service')}
                </TableHead>
                <TableHead className='pr-2 text-right'>
                  {tServices('actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicesLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={UNIT_SERVICES_TABLE_COL_COUNT}
                    className='text-center'
                  >
                    {tServices('loading', {
                      defaultValue: 'Loading services...'
                    })}
                  </TableCell>
                </TableRow>
              ) : services.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={UNIT_SERVICES_TABLE_COL_COUNT}
                    className='text-center'
                  >
                    {tServices('no_services_found', {
                      defaultValue: 'No services found'
                    })}
                  </TableCell>
                </TableRow>
              ) : filteredTree.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={UNIT_SERVICES_TABLE_COL_COUNT}
                    className='text-center'
                  >
                    {tServices('no_match_filters')}
                  </TableCell>
                </TableRow>
              ) : (
                <ServiceTreeRows
                  nodes={filteredTree}
                  depth={0}
                  locale={locale}
                  zoneNameById={zoneNameById}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  tServices={tServices}
                  tRoot={tRoot}
                  tStats={tStats}
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side='right'
          className={cn(
            'flex h-full w-full max-w-full flex-col gap-0 border-l p-0 sm:max-w-xl'
          )}
        >
          <SheetHeader className='border-border shrink-0 space-y-1 border-b px-6 py-4 text-left'>
            <SheetTitle>
              {editingService ? tServices('edit') : tServices('add_new')}
            </SheetTitle>
            <SheetDescription>
              {editingService
                ? tServices('editing_desc', {
                    name: serviceTitleForLocale(editingService, locale),
                    defaultValue: `Editing service: ${serviceTitleForLocale(editingService, locale)}`
                  })
                : tServices('creating_desc', {
                    defaultValue: 'Create a new service'
                  })}
            </SheetDescription>
          </SheetHeader>
          <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
            {(editingService || isCreating) && (
              <ServiceForm
                key={isCreating ? 'create' : editingService!.id}
                editingService={editingService}
                isCreating={isCreating}
                selectedUnitId={selectedUnitId}
                services={services}
                onDirtyChange={setFormIsDirty}
                onCancel={handleCancel}
                onSaved={() => {
                  setEditingService(null);
                  setIsCreating(false);
                  setFormIsDirty(false);
                  refetch();
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function indentPaddingClass(depth: number): string {
  const i = Math.min(Math.max(depth, 0), 4);
  return ['pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16'][i]!;
}

function formatSlaDurationLocal(
  totalSec: number,
  t: ReturnType<typeof useTranslations<'statistics'>>
): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0 && s === 0) return `${m}${t('minutes_short')}`;
  if (m > 0) {
    return t('duration_format_min_sec', {
      minutes: m,
      seconds: s.toString().padStart(2, '0')
    });
  }
  return `${s}${t('seconds_short')}`;
}

function DurationBadge({
  seconds,
  Icon,
  variant = 'secondary',
  t
}: {
  seconds?: number | null;
  Icon: LucideIcon;
  variant?: 'secondary' | 'destructive';
  t: ReturnType<typeof useTranslations<'statistics'>>;
}) {
  if (seconds == null || seconds <= 0) {
    return <span className='text-muted-foreground'>—</span>;
  }
  return (
    <Badge variant={variant} className='max-w-full font-normal tabular-nums'>
      <Icon className='shrink-0' aria-hidden />
      <span className='min-w-0'>{formatSlaDurationLocal(seconds, t)}</span>
    </Badge>
  );
}

function ServiceTreeRows({
  nodes,
  depth,
  locale,
  zoneNameById,
  onEdit,
  onDelete,
  tServices,
  tRoot,
  tStats
}: {
  nodes: ServiceNode[];
  depth: number;
  locale: string;
  zoneNameById: ReadonlyMap<string, string>;
  onEdit: (s: Service) => void;
  onDelete: (id: string) => void;
  tServices: ReturnType<typeof useTranslations<'admin.services'>>;
  tRoot: ReturnType<typeof useTranslations>;
  tStats: ReturnType<typeof useTranslations<'statistics'>>;
}) {
  return (
    <>
      {nodes.map((node) => (
        <Fragment key={node.id}>
          <TableRow>
            <TableCell
              className={cn(
                'max-w-0 font-medium whitespace-normal',
                indentPaddingClass(depth)
              )}
            >
              <div className='flex min-w-0 items-center gap-2'>
                {node.isLeaf ? (
                  <Ticket
                    className='size-4 shrink-0 text-sky-600 dark:text-sky-400'
                    aria-hidden
                  />
                ) : (
                  <FolderIcon
                    size={16}
                    className='shrink-0 text-amber-600 dark:text-amber-400'
                    aria-hidden
                  />
                )}
                <span className='truncate'>
                  {serviceTitleForLocale(node, locale)}
                </span>
              </div>
            </TableCell>
            <TableCell className='text-muted-foreground max-w-0 whitespace-normal'>
              <span className='block truncate'>
                {node.isLeaf && node.restrictedServiceZoneId?.trim()
                  ? (zoneNameById.get(node.restrictedServiceZoneId.trim()) ??
                    '—')
                  : '—'}
              </span>
            </TableCell>
            <TableCell>{node.prefix || '-'}</TableCell>
            <TableCell className='max-w-0 whitespace-normal'>
              {!node.isLeaf ? (
                <span className='text-muted-foreground'>—</span>
              ) : (
                <DurationBadge
                  seconds={node.maxWaitingTime}
                  Icon={Clock}
                  variant='destructive'
                  t={tStats}
                />
              )}
            </TableCell>
            <TableCell className='max-w-0 whitespace-normal'>
              <DurationBadge seconds={node.duration} Icon={Gauge} t={tStats} />
            </TableCell>
            <TableCell className='max-w-0 whitespace-normal'>
              {!node.isLeaf ? (
                <span className='text-muted-foreground'>—</span>
              ) : (
                <DurationBadge
                  seconds={node.maxServiceTime}
                  Icon={Timer}
                  variant='destructive'
                  t={tStats}
                />
              )}
            </TableCell>
            <TableCell className='w-[88px] max-w-[88px] p-2 text-right whitespace-nowrap'>
              <div className='flex justify-end gap-0.5'>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-8 shrink-0'
                  onClick={() => onEdit(node)}
                  aria-label={tServices('edit')}
                  title={tServices('edit')}
                >
                  <Pencil className='size-4' aria-hidden />
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='text-destructive hover:bg-destructive/10 hover:text-destructive size-8 shrink-0'
                  onClick={() => onDelete(node.id)}
                  aria-label={tRoot('general.delete', {
                    defaultValue: 'Delete'
                  })}
                  title={tRoot('general.delete', {
                    defaultValue: 'Delete'
                  })}
                >
                  <Trash2 className='size-4' aria-hidden />
                </Button>
              </div>
            </TableCell>
          </TableRow>
          {node.children.length > 0 ? (
            <ServiceTreeRows
              nodes={node.children}
              depth={depth + 1}
              locale={locale}
              zoneNameById={zoneNameById}
              onEdit={onEdit}
              onDelete={onDelete}
              tServices={tServices}
              tRoot={tRoot}
              tStats={tStats}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

function buildInitialFormValues(
  editingService: Service | null,
  isCreating: boolean
): Partial<Service> {
  if (editingService) {
    return {
      name: editingService.name,
      nameRu: editingService.nameRu ?? editingService.name ?? '',
      nameEn: editingService.nameEn ?? '',
      description: editingService.description ?? '',
      descriptionRu: editingService.descriptionRu ?? '',
      descriptionEn: editingService.descriptionEn ?? '',
      imageUrl: editingService.imageUrl ?? '',
      backgroundColor: editingService.backgroundColor ?? '',
      textColor: editingService.textColor ?? '',
      prefix: editingService.prefix ?? '',
      duration: editingService.duration ?? undefined,
      maxWaitingTime: editingService.maxWaitingTime ?? undefined,
      maxServiceTime: editingService.maxServiceTime ?? undefined,
      prebook: editingService.prebook ?? false,
      offerIdentification: editingService.offerIdentification ?? false,
      isLeaf: editingService.isLeaf ?? false,
      parentId: editingService.parentId ?? '',
      restrictedServiceZoneId: editingService.restrictedServiceZoneId ?? null,
      calendarSlotKey: editingService.calendarSlotKey ?? '',
      numberSequence: editingService.numberSequence ?? undefined,
      gridRow: editingService.gridRow ?? undefined,
      gridCol: editingService.gridCol ?? undefined,
      gridRowSpan: editingService.gridRowSpan ?? undefined,
      gridColSpan: editingService.gridColSpan ?? undefined
    };
  }
  if (isCreating) {
    return {
      name: '',
      nameRu: '',
      nameEn: '',
      description: '',
      descriptionRu: '',
      descriptionEn: '',
      imageUrl: '',
      backgroundColor: '',
      textColor: '',
      prefix: '',
      duration: undefined,
      maxWaitingTime: undefined,
      maxServiceTime: undefined,
      prebook: false,
      offerIdentification: false,
      isLeaf: false,
      parentId: '',
      restrictedServiceZoneId: null,
      calendarSlotKey: ''
    };
  }
  return {};
}

function snapshotServiceFormValues(v: Partial<Service>): string {
  return JSON.stringify({
    namePrimary:
      (v.nameRu ?? '').toString().trim() || (v.name ?? '').toString().trim(),
    nameEn: v.nameEn ?? '',
    description: v.description ?? '',
    descriptionRu: v.descriptionRu ?? '',
    descriptionEn: v.descriptionEn ?? '',
    imageUrl: v.imageUrl ?? '',
    backgroundColor: v.backgroundColor ?? '',
    textColor: v.textColor ?? '',
    prefix: v.prefix ?? '',
    duration: v.duration ?? null,
    maxWaitingTime: v.maxWaitingTime ?? null,
    maxServiceTime: v.maxServiceTime ?? null,
    prebook: !!v.prebook,
    offerIdentification: !!v.offerIdentification,
    isLeaf: !!v.isLeaf,
    parentId: v.parentId ?? '',
    restrictedServiceZoneId: v.restrictedServiceZoneId ?? null,
    calendarSlotKey: v.calendarSlotKey ?? ''
  });
}

function areServiceFormValuesEqual(
  a: Partial<Service>,
  b: Partial<Service>
): boolean {
  return snapshotServiceFormValues(a) === snapshotServiceFormValues(b);
}

function ServiceForm({
  editingService,
  isCreating,
  selectedUnitId,
  services,
  onDirtyChange,
  onCancel,
  onSaved
}: {
  editingService: Service | null;
  isCreating: boolean;
  selectedUnitId: string;
  services: Service[];
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tServices = useTranslations('admin.services');
  const tRoot = useTranslations();
  const tUnits = useTranslations('admin.units');
  const locale = useLocale();
  const createServiceMutation = useCreateService();
  const updateServiceMutation = useUpdateService();

  const { data: childUnitsRaw } = useQuery({
    queryKey: getGetUnitsUnitIdChildUnitsQueryKey(selectedUnitId),
    queryFn: () => unitsApi.getChildUnits(selectedUnitId),
    enabled: !!selectedUnitId && (!!editingService || isCreating)
  });

  const serviceZones = useMemo(
    () =>
      normalizeChildUnitsQueryData(childUnitsRaw).filter(
        (u) => u.kind === 'service_zone'
      ),
    [childUnitsRaw]
  );

  const [baselineValues] = useState<Partial<Service>>(() =>
    structuredClone(buildInitialFormValues(editingService, isCreating))
  );

  const [formValues, setFormValues] = useState<Partial<Service>>(() =>
    structuredClone(buildInitialFormValues(editingService, isCreating))
  );

  const [englishBlockOpen, setEnglishBlockOpen] = useState(() => {
    if (!editingService) return false;
    const ne = (editingService.nameEn ?? '').trim();
    const d = (editingService.description ?? '').trim();
    const de = (editingService.descriptionEn ?? '').trim();
    return !!(ne || d || de);
  });

  const closeEnglishBlock = useCallback(() => {
    setEnglishBlockOpen(false);
    setFormValues((prev) => ({
      ...prev,
      nameEn: '',
      description: '',
      descriptionEn: ''
    }));
  }, []);

  const isDirty = useMemo(
    () => !areServiceFormValuesEqual(formValues, baselineValues),
    [formValues, baselineValues]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    setFormValues((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUnitId) return;

    const nameRuTrim = (formValues.nameRu ?? '').trim();
    if (!nameRuTrim) {
      toast.error(
        tServices('name_ru_required', {
          defaultValue: 'Enter the name in Russian.'
        })
      );
      return;
    }

    try {
      const isLeafNow = formValues.isLeaf ?? editingService?.isLeaf ?? false;
      const restrictedPayload = isLeafNow
        ? (formValues.restrictedServiceZoneId ?? null)
        : null;
      const payloadCalendarSlotKey =
        formValues.calendarSlotKey === '' ? null : formValues.calendarSlotKey;
      const payloadBase = {
        ...formValues,
        name: nameRuTrim,
        nameRu: nameRuTrim,
        prebook: formValues.prebook ?? false,
        offerIdentification: formValues.offerIdentification ?? false,
        isLeaf: formValues.isLeaf ?? false,
        restrictedServiceZoneId: restrictedPayload,
        calendarSlotKey: payloadCalendarSlotKey
      };
      if (editingService) {
        await updateServiceMutation.mutateAsync({
          id: editingService.id,
          ...payloadBase,
          prebook: formValues.prebook ?? editingService.prebook ?? false,
          offerIdentification:
            formValues.offerIdentification ??
            editingService.offerIdentification ??
            false,
          isLeaf: formValues.isLeaf ?? editingService.isLeaf ?? false
        });
      } else {
        await createServiceMutation.mutateAsync({
          ...payloadBase,
          unitId: selectedUnitId
        });
      }
      onSaved();
    } catch (error) {
      if (isQuotaExceededError(error)) {
        toast.error(tUnits('quota_exceeded_service'));
      } else {
        logger.error('Error saving service:', error);
        toast.error(tServices('save_error'));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      {isDirty ? (
        <p
          className='rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100'
          role='status'
        >
          {tServices('unsaved_changes')}
        </p>
      ) : null}
      <div className='space-y-2'>
        <Label htmlFor='nameRu'>
          {tRoot('forms.fields.name_ru')}
          <span
            className='text-destructive ml-0.5'
            title={tRoot('forms.fields.required_field')}
            aria-hidden
          >
            *
          </span>
        </Label>
        <div className='flex gap-2'>
          <Input
            id='nameRu'
            name='nameRu'
            value={formValues.nameRu || ''}
            onChange={handleInputChange}
            required
            className='min-w-0 flex-1'
          />
          {!englishBlockOpen ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  className='shrink-0'
                  aria-label={tServices('add_language')}
                >
                  <Plus className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  onSelect={() => setEnglishBlockOpen(true)}
                  className='cursor-pointer'
                >
                  {tServices('language_english')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {englishBlockOpen ? (
        <div className='border-muted bg-muted/30 relative rounded-md border p-3 pr-10'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-foreground absolute top-1 right-1 size-8'
            onClick={closeEnglishBlock}
            title={tServices('remove_english_block')}
            aria-label={tServices('remove_english_block')}
          >
            <X className='size-4' />
          </Button>
          <p className='text-muted-foreground mb-3 text-xs font-medium'>
            {tServices('english_fields_heading')}
          </p>
          <div className='space-y-3'>
            <div className='space-y-2'>
              <Label htmlFor='nameEn'>{tRoot('forms.fields.name_en')}</Label>
              <Input
                id='nameEn'
                name='nameEn'
                value={formValues.nameEn || ''}
                onChange={handleInputChange}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='description'>
                {tRoot('forms.fields.desc_en')}
              </Label>
              <Input
                id='description'
                name='description'
                value={formValues.description || ''}
                onChange={handleInputChange}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className='space-y-2'>
        <Label htmlFor='descriptionRu'>{tRoot('forms.fields.desc_ru')}</Label>
        <Input
          id='descriptionRu'
          name='descriptionRu'
          value={formValues.descriptionRu || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className='space-y-2'>
        <ImageUpload
          label={tRoot('forms.fields.image_url')}
          value={formValues.imageUrl}
          onChange={(url) =>
            setFormValues((prev) => ({ ...prev, imageUrl: url }))
          }
          onRemove={() => setFormValues((prev) => ({ ...prev, imageUrl: '' }))}
        />
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <Label htmlFor='backgroundColor'>
            {tRoot('forms.fields.bg_color')}
          </Label>
          <Input
            id='backgroundColor'
            name='backgroundColor'
            type='color'
            value={formValues.backgroundColor || '#000000'}
            onChange={handleInputChange}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='textColor'>{tRoot('forms.fields.text_color')}</Label>
          <Input
            id='textColor'
            name='textColor'
            type='color'
            value={formValues.textColor || '#000000'}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='prefix'>{tRoot('forms.fields.prefix')}</Label>
        <Input
          id='prefix'
          name='prefix'
          value={formValues.prefix || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='calendarSlotKey'>
          {tServices('calendar_slot_key', {
            defaultValue: 'Calendar slot label (optional)'
          })}
        </Label>
        <Input
          id='calendarSlotKey'
          name='calendarSlotKey'
          value={formValues.calendarSlotKey || ''}
          onChange={handleInputChange}
          placeholder={tServices('calendar_slot_placeholder', {
            defaultValue: 'e.g. Returns-Desk-A'
          })}
        />
        <p className='text-muted-foreground text-xs'>
          {tServices('calendar_slot_key_hint', {
            defaultValue:
              'Used in pre-registration and when syncing with connected calendars. If two services share the same display name, this label distinguishes them; it is included in calendar event titles so the correct slots are created.'
          })}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='parentId'>{tRoot('forms.fields.parent_service')}</Label>
        <Select
          value={formValues.parentId || 'none'}
          onValueChange={(value) =>
            setFormValues((prev) => ({
              ...prev,
              parentId: value === 'none' ? '' : value
            }))
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder={tRoot('forms.fields.no_parent')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>
              {tRoot('forms.fields.no_parent')}
            </SelectItem>
            {services
              .filter((s) => s.id !== editingService?.id && !s.isLeaf) // Don't show current service as option
              .map((service) => {
                const parentSvc = service.parentId
                  ? services.find((p) => p.id === service.parentId)
                  : undefined;
                return (
                  <SelectItem key={service.id} value={service.id}>
                    {serviceTitleForLocale(service, locale)}{' '}
                    {parentSvc
                      ? `(${tRoot('forms.fields.child_of', { defaultValue: 'child of' })} ${serviceTitleForLocale(parentSvc, locale)})`
                      : ''}
                  </SelectItem>
                );
              })}
          </SelectContent>
        </Select>
      </div>

      {(formValues.isLeaf ?? editingService?.isLeaf ?? false) ? (
        <div className='space-y-2'>
          <Label htmlFor='restrictedServiceZoneId'>
            {tServices('restricted_zone')}
          </Label>
          <Select
            value={
              formValues.restrictedServiceZoneId
                ? formValues.restrictedServiceZoneId
                : '__none__'
            }
            onValueChange={(value) =>
              setFormValues((prev) => ({
                ...prev,
                restrictedServiceZoneId: value === '__none__' ? null : value
              }))
            }
          >
            <SelectTrigger id='restrictedServiceZoneId' className='w-full'>
              <SelectValue placeholder={tServices('restricted_zone_none')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='__none__'>
                {tServices('restricted_zone_none')}
              </SelectItem>
              {serviceZones
                .filter(
                  (zone): zone is typeof zone & { id: string } =>
                    typeof zone.id === 'string' && zone.id.trim().length > 0
                )
                .map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {getUnitDisplayName(zone, locale)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {tServices('restricted_zone_hint')}
          </p>
        </div>
      ) : null}

      <div className='space-y-2'>
        <Label htmlFor='maxWaitingTime'>
          {tRoot('forms.fields.max_waiting_time')}
        </Label>
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <Label
              htmlFor='mwt_minutes'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.minutes', { defaultValue: 'Minutes' })}
            </Label>
            <Input
              id='mwt_minutes'
              type='number'
              min='0'
              value={
                formValues.maxWaitingTime
                  ? Math.floor(formValues.maxWaitingTime / 60)
                  : 0
              }
              onChange={(e) => {
                const mins = parseInt(e.target.value) || 0;
                const secs = (formValues.maxWaitingTime || 0) % 60;
                setFormValues((prev) => ({
                  ...prev,
                  maxWaitingTime: mins * 60 + secs
                }));
              }}
            />
          </div>
          <div className='flex-1'>
            <Label
              htmlFor='mwt_seconds'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.seconds', { defaultValue: 'Seconds' })}
            </Label>
            <Input
              id='mwt_seconds'
              type='number'
              min='0'
              max='59'
              value={
                formValues.maxWaitingTime ? formValues.maxWaitingTime % 60 : 0
              }
              onChange={(e) => {
                const secs = parseInt(e.target.value) || 0;
                const mins = Math.floor((formValues.maxWaitingTime || 0) / 60);
                setFormValues((prev) => ({
                  ...prev,
                  maxWaitingTime: mins * 60 + secs
                }));
              }}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setFormValues((prev) => ({ ...prev, maxWaitingTime: undefined }))
            }
            disabled={
              formValues.maxWaitingTime === undefined ||
              formValues.maxWaitingTime === 0
            }
          >
            {tRoot('general.clear', { defaultValue: 'Clear' })}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.total', { defaultValue: 'Total' })}:{' '}
          {formValues.maxWaitingTime || 0}{' '}
          {tRoot('forms.fields.seconds', { defaultValue: 'seconds' })}
        </p>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.max_waiting_time_hint')}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='duration'>
          {tRoot('forms.fields.expected_duration')}
        </Label>
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <Label
              htmlFor='duration_minutes'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.minutes', { defaultValue: 'Minutes' })}
            </Label>
            <Input
              id='duration_minutes'
              type='number'
              min='0'
              value={
                formValues.duration
                  ? Math.floor((formValues.duration || 0) / 60)
                  : 0
              }
              onChange={(e) => {
                const mins = parseInt(e.target.value) || 0;
                const secs = (formValues.duration || 0) % 60;
                setFormValues((prev) => ({
                  ...prev,
                  duration: mins * 60 + secs
                }));
              }}
            />
          </div>
          <div className='flex-1'>
            <Label
              htmlFor='duration_seconds'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.seconds', { defaultValue: 'Seconds' })}
            </Label>
            <Input
              id='duration_seconds'
              type='number'
              min='0'
              max='59'
              value={formValues.duration ? (formValues.duration || 0) % 60 : 0}
              onChange={(e) => {
                const secs = parseInt(e.target.value) || 0;
                const mins = Math.floor((formValues.duration || 0) / 60);
                setFormValues((prev) => ({
                  ...prev,
                  duration: mins * 60 + secs
                }));
              }}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setFormValues((prev) => ({ ...prev, duration: undefined }))
            }
            disabled={
              formValues.duration === undefined || formValues.duration === 0
            }
          >
            {tRoot('general.clear', { defaultValue: 'Clear' })}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.total', { defaultValue: 'Total' })}:{' '}
          {formValues.duration || 0}{' '}
          {tRoot('forms.fields.seconds', { defaultValue: 'seconds' })}
        </p>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.expected_duration_hint')}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='maxServiceTime'>
          {tRoot('forms.fields.max_service_time', {
            defaultValue: 'Max Service Time (SLA)'
          })}
        </Label>
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <Label
              htmlFor='mst_minutes'
              className='text-muted-foreground mb-1 block text-xs'
            >
              {tRoot('forms.fields.minutes', { defaultValue: 'min' })}
            </Label>
            <Input
              id='mst_minutes'
              type='number'
              min='0'
              value={
                formValues.maxServiceTime
                  ? Math.floor(formValues.maxServiceTime / 60)
                  : 0
              }
              onChange={(e) => {
                const mins = parseInt(e.target.value) || 0;
                const secs = (formValues.maxServiceTime || 0) % 60;
                setFormValues((prev) => ({
                  ...prev,
                  maxServiceTime: mins * 60 + secs
                }));
              }}
            />
          </div>
          <div className='flex-1'>
            <Label
              htmlFor='mst_seconds'
              className='text-muted-foreground mb-1 block text-xs'
            >
              {tRoot('forms.fields.seconds', { defaultValue: 'sec' })}
            </Label>
            <Input
              id='mst_seconds'
              type='number'
              min='0'
              max='59'
              value={
                formValues.maxServiceTime ? formValues.maxServiceTime % 60 : 0
              }
              onChange={(e) => {
                const secs = parseInt(e.target.value) || 0;
                const mins = Math.floor((formValues.maxServiceTime || 0) / 60);
                setFormValues((prev) => ({
                  ...prev,
                  maxServiceTime: mins * 60 + secs
                }));
              }}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setFormValues((prev) => ({ ...prev, maxServiceTime: null }))
            }
            disabled={
              formValues.maxServiceTime == null ||
              formValues.maxServiceTime === 0
            }
          >
            {tRoot('general.clear', { defaultValue: 'Clear' })}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.total', { defaultValue: 'Total' })}:{' '}
          {formValues.maxServiceTime || 0}{' '}
          {tRoot('forms.fields.seconds', { defaultValue: 'seconds' })}
        </p>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.max_service_time_hint')}
        </p>
      </div>

      <div className='space-y-3'>
        <div className='flex items-start gap-2'>
          <Checkbox
            id='prebook'
            checked={!!formValues.prebook}
            onCheckedChange={(v) =>
              setFormValues((prev) => ({ ...prev, prebook: v === true }))
            }
            className='mt-0.5'
          />
          <Label htmlFor='prebook' className='cursor-pointer font-normal'>
            {tRoot('forms.fields.allow_prebooking')}
          </Label>
        </div>

        <div className='flex items-start gap-2'>
          <Checkbox
            id='offerIdentification'
            checked={!!formValues.offerIdentification}
            onCheckedChange={(v) =>
              setFormValues((prev) => ({
                ...prev,
                offerIdentification: v === true
              }))
            }
            className='mt-0.5'
          />
          <Label
            htmlFor='offerIdentification'
            className='cursor-pointer font-normal'
          >
            {tRoot('forms.fields.offer_identification')}
          </Label>
        </div>

        <div className='flex items-start gap-2'>
          <Checkbox
            id='isLeaf'
            checked={!!formValues.isLeaf}
            onCheckedChange={(v) =>
              setFormValues((prev) => ({ ...prev, isLeaf: v === true }))
            }
            className='mt-0.5'
          />
          <Label htmlFor='isLeaf' className='cursor-pointer font-normal'>
            {tRoot('forms.fields.is_leaf')}
          </Label>
        </div>
      </div>

      <div className='flex space-x-2 pt-4'>
        <Button
          type='submit'
          disabled={
            createServiceMutation.isPending ||
            updateServiceMutation.isPending ||
            (!editingService && !(formValues.nameRu ?? '').trim()) ||
            (!!editingService && !isDirty)
          }
        >
          {createServiceMutation.isPending || updateServiceMutation.isPending
            ? tRoot('common.loading', { defaultValue: 'Saving...' })
            : editingService
              ? tRoot('general.update', { defaultValue: 'Update' })
              : tRoot('general.create', { defaultValue: 'Create' })}
        </Button>
        <Button type='button' variant='outline' onClick={onCancel}>
          {tRoot('general.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </form>
  );
}
