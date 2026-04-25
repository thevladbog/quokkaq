'use client';

import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
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
import { Textarea } from '@/components/ui/textarea';
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
import {
  getServiceIdentificationMode,
  type KioskIdentificationMode
} from '@/lib/kiosk-service-identification';
import {
  isKioskServiceIconPresetValue,
  KIOSK_SERVICE_ICON_PRESETS,
  normalizeKioskServiceIconKey,
  resolveKioskServiceIcon
} from '@/lib/kiosk-service-icon';
import type { Service } from '@quokkaq/shared-types';
import type { LucideIcon } from 'lucide-react';
import {
  Clock,
  Gauge,
  Pencil,
  Plus,
  Settings2,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  adminClampNumericMaxLength,
  getKioskBarcodeManualInputMode,
  type KioskCustomManualInputMode
} from '@/lib/kiosk-custom-ident-input';

interface UnitServicesManagerProps {
  unitId: string;
}

const UNIT_SERVICES_TABLE_COL_COUNT = 7;

type KioskIdentConfigForm = {
  capture?: {
    kind?: string;
    /** When `kind` is `barcode`: how to constrain manual / wedge entry. */
    manualInputMode?: KioskCustomManualInputMode;
    /** When `manualInputMode` is `numeric` (1–64). */
    numericMaxLength?: number;
    /**
     * When `kind` is `barcode`: if false, field is `readOnly` to suppress on-screen
     * keyboard; scanner/serial can still set the value. Default true.
     */
    showOnScreenKeyboard?: boolean;
  };
  operatorLabel?: { ru?: string; en?: string };
  userInstruction?: { ru?: string; en?: string };
  skippable?: boolean;
  apiFieldKey?: string;
  showInQueuePreview?: boolean;
  sensitive?: boolean;
  retentionDays?: number;
};

function defaultKioskIdentConfigForm(): KioskIdentConfigForm {
  return {
    capture: { kind: 'keyboard_ru_en' },
    operatorLabel: { ru: '', en: '' },
    userInstruction: { ru: '', en: '' },
    skippable: false,
    apiFieldKey: 'value',
    showInQueuePreview: false,
    sensitive: false
  };
}

function parseKioskIdentConfigForm(raw: unknown): KioskIdentConfigForm {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      parsed = j;
    } catch {
      return defaultKioskIdentConfigForm();
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const p = parsed as KioskIdentConfigForm;
    const d = defaultKioskIdentConfigForm();
    const capture = {
      ...d.capture,
      ...(p.capture || {})
    } as KioskIdentConfigForm['capture'];
    // Normalize `manualInputMode` / `manual_input_mode` on barcode so the UI + PUT payload match DB.
    const captureMerged =
      capture?.kind === 'barcode'
        ? {
            ...capture,
            manualInputMode: getKioskBarcodeManualInputMode({ capture } as {
              capture: unknown;
            })
          }
        : capture;
    let captureNormalized = captureMerged;
    if (captureNormalized?.kind === 'ocr') {
      captureNormalized = {
        ...captureNormalized,
        kind: 'keyboard_ru_en'
      };
    }
    return {
      ...d,
      ...p,
      capture: captureNormalized
    };
  }
  return defaultKioskIdentConfigForm();
}

const CAPTURE_KIND_OPTIONS = [
  { value: 'keyboard_ru_en', i18nKey: 'kiosk_custom_capture_keyboard_ru_en' },
  { value: 'digits', i18nKey: 'kiosk_custom_capture_digits' },
  { value: 'barcode', i18nKey: 'kiosk_custom_capture_barcode' }
] as const;

const CAPTURE_BARCODE_MANUAL_MODES: {
  value: KioskCustomManualInputMode;
  i18nKey: string;
}[] = [
  { value: 'none', i18nKey: 'kiosk_custom_barcode_manual_none' },
  {
    value: 'alphanumeric',
    i18nKey: 'kiosk_custom_barcode_manual_alphanumeric'
  },
  { value: 'numeric', i18nKey: 'kiosk_custom_barcode_manual_numeric' }
];

function buildKioskPayloadsForServiceForm(
  idMode: KioskIdentificationMode,
  formValues: Partial<Service>
): { kioskDocumentSettings: unknown; kioskIdentificationConfig: unknown } {
  const docRaw = formValues.kioskDocumentSettings;
  let retentionFromDoc = 7;
  if (docRaw && typeof docRaw === 'object' && 'retentionDays' in docRaw) {
    const n = Math.floor(
      Number((docRaw as { retentionDays?: number }).retentionDays)
    );
    if (!Number.isNaN(n)) {
      retentionFromDoc = n;
    }
  }
  const docRetention = Math.max(1, Math.min(30, retentionFromDoc));
  const kioskDocumentSettings =
    idMode === 'document' ? { retentionDays: docRetention } : null;

  const ident = parseKioskIdentConfigForm(formValues.kioskIdentificationConfig);
  if (idMode !== 'custom') {
    return { kioskDocumentSettings, kioskIdentificationConfig: null };
  }
  const captureKind = ident.capture?.kind ?? 'keyboard_ru_en';
  let builtCapture: Record<string, unknown>;
  if (captureKind === 'barcode') {
    const mode: KioskCustomManualInputMode =
      ident.capture?.manualInputMode ?? 'alphanumeric';
    const showKbd = ident.capture?.showOnScreenKeyboard;
    builtCapture = {
      kind: 'barcode',
      manualInputMode: mode,
      showOnScreenKeyboard: showKbd !== false
    };
    if (mode === 'numeric') {
      builtCapture.numericMaxLength = adminClampNumericMaxLength(
        ident.capture?.numericMaxLength
      );
    }
  } else if (captureKind === 'digits') {
    builtCapture = { kind: 'digits' };
  } else {
    builtCapture = { kind: 'keyboard_ru_en' };
  }
  const kic: Record<string, unknown> = {
    capture: builtCapture,
    operatorLabel: {
      ru: (ident.operatorLabel?.ru ?? '').trim(),
      en: (ident.operatorLabel?.en ?? '').trim()
    },
    userInstruction: {
      ru: (ident.userInstruction?.ru ?? '').trim(),
      en: (ident.userInstruction?.en ?? '').trim()
    },
    skippable: !!ident.skippable,
    apiFieldKey: (ident.apiFieldKey ?? 'value').trim() || 'value',
    showInQueuePreview: !!ident.showInQueuePreview,
    sensitive: !!ident.sensitive
  };
  if (ident.sensitive) {
    let rd = Math.floor(ident.retentionDays ?? 7);
    if (Number.isNaN(rd)) rd = 7;
    kic.retentionDays = Math.max(1, Math.min(30, rd));
  }
  return { kioskDocumentSettings, kioskIdentificationConfig: kic };
}

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
      iconKey: normalizeKioskServiceIconKey(editingService.iconKey) || '',
      backgroundColor: editingService.backgroundColor ?? '',
      textColor: editingService.textColor ?? '',
      prefix: editingService.prefix ?? '',
      duration: editingService.duration ?? undefined,
      maxWaitingTime: editingService.maxWaitingTime ?? undefined,
      maxServiceTime: editingService.maxServiceTime ?? undefined,
      prebook: editingService.prebook ?? false,
      offerIdentification: editingService.offerIdentification ?? false,
      identificationMode: getServiceIdentificationMode(editingService),
      isLeaf: editingService.isLeaf ?? false,
      parentId: editingService.parentId ?? '',
      restrictedServiceZoneId: editingService.restrictedServiceZoneId ?? null,
      calendarSlotKey: editingService.calendarSlotKey ?? '',
      numberSequence: editingService.numberSequence ?? undefined,
      sortOrder: editingService.sortOrder ?? 0,
      gridRow: editingService.gridRow ?? undefined,
      gridCol: editingService.gridCol ?? undefined,
      gridRowSpan: editingService.gridRowSpan ?? undefined,
      gridColSpan: editingService.gridColSpan ?? undefined,
      kioskDocumentSettings: (
        editingService as { kioskDocumentSettings?: unknown }
      ).kioskDocumentSettings ?? {
        retentionDays: 7
      },
      kioskIdentificationConfig: parseKioskIdentConfigForm(
        (editingService as { kioskIdentificationConfig?: unknown })
          .kioskIdentificationConfig
      )
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
      iconKey: '',
      backgroundColor: '',
      textColor: '',
      prefix: '',
      duration: undefined,
      maxWaitingTime: undefined,
      maxServiceTime: undefined,
      prebook: false,
      offerIdentification: false,
      identificationMode: 'none' as const,
      isLeaf: false,
      parentId: '',
      restrictedServiceZoneId: null,
      calendarSlotKey: '',
      kioskDocumentSettings: { retentionDays: 7 },
      kioskIdentificationConfig: defaultKioskIdentConfigForm()
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
    iconKey: v.iconKey ?? '',
    backgroundColor: v.backgroundColor ?? '',
    textColor: v.textColor ?? '',
    prefix: v.prefix ?? '',
    duration: v.duration ?? null,
    maxWaitingTime: v.maxWaitingTime ?? null,
    maxServiceTime: v.maxServiceTime ?? null,
    prebook: !!v.prebook,
    offerIdentification: !!v.offerIdentification,
    identificationMode: v.identificationMode ?? 'none',
    isLeaf: !!v.isLeaf,
    parentId: v.parentId ?? '',
    restrictedServiceZoneId: v.restrictedServiceZoneId ?? null,
    calendarSlotKey: v.calendarSlotKey ?? '',
    sortOrder: v.sortOrder ?? 0,
    kioskKiosk: JSON.stringify([
      v.kioskDocumentSettings ?? null,
      v.kioskIdentificationConfig ?? null
    ])
  });
}

function areServiceFormValuesEqual(
  a: Partial<Service>,
  b: Partial<Service>
): boolean {
  return snapshotServiceFormValues(a) === snapshotServiceFormValues(b);
}

function KioskServiceIconKeySelect({
  tServices,
  value,
  onValueChange
}: {
  tServices: (key: string, values?: Record<string, string>) => string;
  value: string;
  onValueChange: (iconKey: string) => void;
}) {
  const iconKeyForSelect = value.trim();
  const isUnknownUnlisted = Boolean(
    iconKeyForSelect && !isKioskServiceIconPresetValue(iconKeyForSelect)
  );
  const selectValue = !iconKeyForSelect ? '__none__' : iconKeyForSelect;

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onValueChange(v === '__none__' ? '' : v)}
    >
      <SelectTrigger
        id='serviceIconKey'
        className='h-auto min-h-9 w-full max-w-md py-2.5 text-left'
      >
        <SelectValue placeholder={tServices('kiosk_icon_key_placeholder')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          value='__none__'
          textValue={tServices('kiosk_icon_key_none')}
        >
          <span className='text-muted-foreground'>
            {tServices('kiosk_icon_key_none')}
          </span>
        </SelectItem>
        {isUnknownUnlisted ? (
          <SelectItem
            value={iconKeyForSelect}
            textValue={tServices('kiosk_icon_key_custom_unknown', {
              value: iconKeyForSelect
            })}
          >
            <div className='flex w-full min-w-0 items-center gap-2.5'>
              {createElement(resolveKioskServiceIcon(iconKeyForSelect), {
                className: 'text-muted-foreground size-4 shrink-0',
                strokeWidth: 2,
                'aria-hidden': true
              })}
              <span className='min-w-0 text-left text-sm leading-snug break-all'>
                {tServices('kiosk_icon_key_custom_unknown', {
                  value: iconKeyForSelect
                })}
              </span>
            </div>
          </SelectItem>
        ) : null}
        {KIOSK_SERVICE_ICON_PRESETS.map((p) => {
          const Icon = p.icon;
          return (
            <SelectItem
              key={p.value}
              value={p.value}
              textValue={tServices(p.i18nKey)}
            >
              <div className='flex w-full min-w-0 items-center gap-2.5'>
                <Icon
                  className='text-muted-foreground size-4 shrink-0'
                  strokeWidth={2}
                  aria-hidden
                />
                <span className='min-w-0 flex-1 truncate text-left text-sm leading-snug'>
                  {tServices(p.i18nKey)}
                </span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
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

  const [docSettingsOpen, setDocSettingsOpen] = useState(false);
  const [customSettingsOpen, setCustomSettingsOpen] = useState(false);
  const [kioskCustomLabelEnOpen, setKioskCustomLabelEnOpen] = useState(() => {
    if (!editingService) {
      return false;
    }
    return !!parseKioskIdentConfigForm(
      (editingService as { kioskIdentificationConfig?: unknown })
        .kioskIdentificationConfig
    ).operatorLabel?.en?.trim();
  });
  const [kioskCustomInstructionEnOpen, setKioskCustomInstructionEnOpen] =
    useState(() => {
      if (!editingService) {
        return false;
      }
      return !!parseKioskIdentConfigForm(
        (editingService as { kioskIdentificationConfig?: unknown })
          .kioskIdentificationConfig
      ).userInstruction?.en?.trim();
    });

  const syncKioskIdentModalEnBlockVisibility = useCallback(
    (kioskIdConfig: unknown) => {
      const c = parseKioskIdentConfigForm(kioskIdConfig);
      setKioskCustomLabelEnOpen(!!c.operatorLabel?.en?.trim());
      setKioskCustomInstructionEnOpen(!!c.userInstruction?.en?.trim());
    },
    []
  );

  // Helper to check if a service is a descendant of the editing service
  const isDescendant = useCallback(
    (candidateId: string, ancestorId: string | undefined): boolean => {
      if (!ancestorId) return false;
      let current = services.find((s) => s.id === candidateId);
      while (current?.parentId) {
        if (current.parentId === ancestorId) return true;
        current = services.find((s) => s.id === current?.parentId);
      }
      return false;
    },
    [services]
  );

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
      const idMode =
        (formValues.identificationMode as
          | KioskIdentificationMode
          | undefined) ?? getServiceIdentificationMode(formValues as Service);
      const { kioskDocumentSettings, kioskIdentificationConfig } =
        buildKioskPayloadsForServiceForm(idMode, formValues);
      const iconRaw = (formValues.iconKey ?? '').trim();
      const iconKeyPayload =
        iconRaw === ''
          ? null
          : normalizeKioskServiceIconKey(iconRaw) || iconRaw;
      // identificationMode is canonical; do not send offerIdentification — random merge
      // order on the server could let offerIdentification:false clear custom/document.
      const payloadBase = {
        ...formValues,
        name: nameRuTrim,
        nameRu: nameRuTrim,
        prebook: formValues.prebook ?? false,
        identificationMode: idMode,
        isLeaf: formValues.isLeaf ?? false,
        restrictedServiceZoneId: restrictedPayload,
        calendarSlotKey: payloadCalendarSlotKey,
        iconKey: iconKeyPayload,
        kioskDocumentSettings,
        kioskIdentificationConfig
      };
      if (editingService) {
        await updateServiceMutation.mutateAsync({
          id: editingService.id,
          ...payloadBase,
          sortOrder: formValues.sortOrder ?? 0,
          prebook: formValues.prebook ?? editingService.prebook ?? false,
          identificationMode: idMode,
          isLeaf: formValues.isLeaf ?? editingService.isLeaf ?? false
        });
      } else {
        const { sortOrder: _omitSort, ...createPayload } = payloadBase;
        void _omitSort;
        await createServiceMutation.mutateAsync({
          ...createPayload,
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
              <Label htmlFor='descriptionEn'>
                {tRoot('forms.fields.desc_en')}
              </Label>
              <Input
                id='descriptionEn'
                name='descriptionEn'
                value={formValues.descriptionEn || ''}
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
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.image_url_hint')}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='serviceIconKey'>{tServices('kiosk_icon_key')}</Label>
        <KioskServiceIconKeySelect
          tServices={tServices}
          value={formValues.iconKey ?? ''}
          onValueChange={(iconKey) =>
            setFormValues((prev) => ({ ...prev, iconKey }))
          }
        />
        <p className='text-muted-foreground text-xs'>
          {tServices('kiosk_icon_key_help')}
        </p>
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
              .filter(
                (s) =>
                  s.id !== editingService?.id &&
                  !s.isLeaf &&
                  !isDescendant(s.id, editingService?.id)
              )
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

        <div className='space-y-1.5'>
          <Label htmlFor='kiosk_identification_mode'>
            {tRoot('forms.fields.kiosk_identification_mode')}
          </Label>
          <Select
            value={getServiceIdentificationMode(formValues as Service)}
            onValueChange={(v) => {
              const mode = v as
                | 'none'
                | 'phone'
                | 'qr'
                | 'document'
                | 'custom'
                | 'login'
                | 'badge';
              setFormValues((prev) => ({
                ...prev,
                identificationMode: mode,
                offerIdentification: mode === 'phone'
              }));
            }}
          >
            <SelectTrigger
              id='kiosk_identification_mode'
              className='w-full max-w-md'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>
                {tRoot('forms.fields.kiosk_identification_mode_none')}
              </SelectItem>
              <SelectItem value='phone'>
                {tRoot('forms.fields.kiosk_identification_mode_phone')}
              </SelectItem>
              <SelectItem value='qr'>
                {tRoot('forms.fields.kiosk_identification_mode_qr')}
              </SelectItem>
              <SelectItem value='document'>
                {tRoot('forms.fields.kiosk_identification_mode_document')}
              </SelectItem>
              <SelectItem value='custom'>
                {tRoot('forms.fields.kiosk_identification_mode_custom', {
                  defaultValue: 'Other (manual / custom field)'
                })}
              </SelectItem>
              <SelectItem value='login'>
                {tRoot('forms.fields.kiosk_identification_mode_login')}
              </SelectItem>
              <SelectItem value='badge'>
                {tRoot('forms.fields.kiosk_identification_mode_badge')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-xs'>
            {tRoot('forms.fields.kiosk_identification_mode_help')}
          </p>
          {(() => {
            const m = getServiceIdentificationMode(formValues as Service);
            if (m !== 'document' && m !== 'custom') {
              return null;
            }
            return (
              <div className='mt-1 flex items-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    if (m === 'document') {
                      setDocSettingsOpen(true);
                    } else {
                      syncKioskIdentModalEnBlockVisibility(
                        formValues.kioskIdentificationConfig
                      );
                      setCustomSettingsOpen(true);
                    }
                  }}
                >
                  <Settings2
                    className='text-muted-foreground mr-1.5 size-3.5'
                    aria-hidden
                  />
                  {m === 'document'
                    ? tServices('kiosk_gear_document', {
                        defaultValue: 'Document & retention…'
                      })
                    : tServices('kiosk_gear_custom', {
                        defaultValue: 'Custom field settings…'
                      })}
                </Button>
              </div>
            );
          })()}
        </div>

        <Dialog open={docSettingsOpen} onOpenChange={setDocSettingsOpen}>
          <DialogContent className='max-w-md'>
            <DialogHeader>
              <DialogTitle>
                {tServices('kiosk_doc_settings_title', {
                  defaultValue: 'ID document data retention'
                })}
              </DialogTitle>
            </DialogHeader>
            <p className='text-muted-foreground text-sm'>
              {tServices('kiosk_doc_settings_hint', {
                defaultValue:
                  'Data entered from document OCR is stored on the ticket for 1–30 days, then removed automatically. DWH/exports: see product policy in API docs.'
              })}
            </p>
            <div className='space-y-1.5'>
              <Label htmlFor='kioskDocRetentionDays'>
                {tServices('kiosk_doc_retention_days', {
                  defaultValue: 'Retention (days, 1–30)'
                })}
              </Label>
              <Input
                id='kioskDocRetentionDays'
                type='number'
                min={1}
                max={30}
                value={(() => {
                  const s = formValues.kioskDocumentSettings;
                  if (s && typeof s === 'object' && 'retentionDays' in s) {
                    return (s as { retentionDays?: number }).retentionDays ?? 7;
                  }
                  return 7;
                })()}
                onChange={(e) => {
                  const n = Math.max(
                    1,
                    Math.min(30, Math.floor(Number(e.target.value) || 7))
                  );
                  setFormValues((p) => ({
                    ...p,
                    kioskDocumentSettings: { retentionDays: n }
                  }));
                }}
              />
            </div>
            <DialogFooter>
              <Button type='button' onClick={() => setDocSettingsOpen(false)}>
                {tRoot('general.done', { defaultValue: 'Done' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={customSettingsOpen}
          onOpenChange={(open) => {
            setCustomSettingsOpen(open);
            if (open) {
              syncKioskIdentModalEnBlockVisibility(
                formValues.kioskIdentificationConfig
              );
            }
          }}
        >
          <DialogContent className='max-h-[85vh] max-w-md overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>
                {tServices('kiosk_custom_settings_title', {
                  defaultValue: 'Custom identification'
                })}
              </DialogTitle>
            </DialogHeader>
            {(() => {
              const c = parseKioskIdentConfigForm(
                formValues.kioskIdentificationConfig
              );
              return (
                <div className='space-y-4 text-sm'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='kioskCapKind'>
                      {tServices('kiosk_custom_capture', {
                        defaultValue: 'Capture on kiosk'
                      })}
                    </Label>
                    <Select
                      value={
                        c.capture?.kind === 'ocr'
                          ? 'keyboard_ru_en'
                          : (c.capture?.kind ?? 'keyboard_ru_en')
                      }
                      onValueChange={(val) => {
                        setFormValues((p) => {
                          const cur = parseKioskIdentConfigForm(
                            p.kioskIdentificationConfig
                          );
                          if (val === 'barcode') {
                            return {
                              ...p,
                              kioskIdentificationConfig: {
                                ...cur,
                                capture: {
                                  kind: 'barcode',
                                  manualInputMode: 'alphanumeric',
                                  numericMaxLength: 20,
                                  showOnScreenKeyboard: true
                                }
                              }
                            };
                          }
                          return {
                            ...p,
                            kioskIdentificationConfig: {
                              ...cur,
                              capture: { kind: val }
                            }
                          };
                        });
                      }}
                    >
                      <SelectTrigger id='kioskCapKind' className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAPTURE_KIND_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {tServices(o.i18nKey, { defaultValue: o.value })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {c.capture?.kind === 'barcode' ? (
                    <>
                      <div className='space-y-1.5'>
                        <Label htmlFor='kioskBarcodeManualMode'>
                          {tServices('kiosk_custom_barcode_keyboard', {
                            defaultValue: 'Manual input (on-screen keyboard)'
                          })}
                        </Label>
                        <Select
                          value={
                            (c.capture?.manualInputMode as
                              | KioskCustomManualInputMode
                              | undefined) ?? 'alphanumeric'
                          }
                          onValueChange={(val: KioskCustomManualInputMode) => {
                            setFormValues((p) => {
                              const cur = parseKioskIdentConfigForm(
                                p.kioskIdentificationConfig
                              );
                              const prevCap = cur.capture ?? {
                                kind: 'barcode'
                              };
                              const next: KioskIdentConfigForm['capture'] = {
                                ...prevCap,
                                kind: 'barcode',
                                manualInputMode: val
                              };
                              if (
                                val === 'numeric' &&
                                next.numericMaxLength == null
                              ) {
                                next.numericMaxLength = 20;
                              }
                              if (val !== 'numeric') {
                                delete (next as { numericMaxLength?: number })
                                  .numericMaxLength;
                              }
                              return {
                                ...p,
                                kioskIdentificationConfig: {
                                  ...cur,
                                  capture: next
                                }
                              };
                            });
                          }}
                        >
                          <SelectTrigger
                            id='kioskBarcodeManualMode'
                            className='w-full'
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CAPTURE_BARCODE_MANUAL_MODES.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {tServices(o.i18nKey, {
                                  defaultValue: o.value
                                })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className='text-muted-foreground text-xs'>
                          {tServices('kiosk_custom_barcode_keyboard_hint', {
                            defaultValue:
                              'The visitor can use a connected scanner and/or type. Numeric mode: digits only, max length; alphanumeric: letters and numbers.'
                          })}
                        </p>
                        <div className='flex items-center gap-2 pt-0.5'>
                          <Checkbox
                            id='kioskBarcodeShowKbd'
                            checked={c.capture?.showOnScreenKeyboard !== false}
                            onCheckedChange={(v) => {
                              setFormValues((p) => {
                                const cur = parseKioskIdentConfigForm(
                                  p.kioskIdentificationConfig
                                );
                                const cap: KioskIdentConfigForm['capture'] = {
                                  ...cur.capture,
                                  kind: 'barcode',
                                  showOnScreenKeyboard: v === true
                                };
                                return {
                                  ...p,
                                  kioskIdentificationConfig: {
                                    ...cur,
                                    capture: cap
                                  }
                                };
                              });
                            }}
                          />
                          <Label
                            htmlFor='kioskBarcodeShowKbd'
                            className='text-sm leading-snug font-normal'
                          >
                            {tServices(
                              'kiosk_custom_barcode_show_onscreen_kbd',
                              {
                                defaultValue:
                                  'Show on-screen keyboard (off = scanner/serial only; the field is read-only for touch typing)'
                              }
                            )}
                          </Label>
                        </div>
                      </div>
                      {(c.capture?.manualInputMode ?? 'alphanumeric') ===
                      'numeric' ? (
                        <div className='space-y-1.5'>
                          <Label htmlFor='kioskBarcodeNumMax'>
                            {tServices('kiosk_custom_barcode_num_max', {
                              defaultValue: 'Max. digits (1–64)'
                            })}
                          </Label>
                          <Input
                            id='kioskBarcodeNumMax'
                            type='number'
                            min={1}
                            max={64}
                            value={
                              adminClampNumericMaxLength(
                                c.capture?.numericMaxLength
                              ) || 20
                            }
                            onChange={(e) => {
                              const n = adminClampNumericMaxLength(
                                Math.floor(Number(e.target.value) || 20)
                              );
                              setFormValues((p) => {
                                const cur = parseKioskIdentConfigForm(
                                  p.kioskIdentificationConfig
                                );
                                return {
                                  ...p,
                                  kioskIdentificationConfig: {
                                    ...cur,
                                    capture: {
                                      kind: 'barcode',
                                      manualInputMode:
                                        (cur.capture
                                          ?.manualInputMode as KioskCustomManualInputMode) ??
                                        'numeric',
                                      numericMaxLength: n
                                    }
                                  }
                                };
                              });
                            }}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className='space-y-1.5'>
                    <Label htmlFor='kioskOpLabelRu'>
                      {tServices('kiosk_custom_label_ru', {
                        defaultValue: 'Field label (RU)'
                      })}
                    </Label>
                    <div className='flex gap-2'>
                      <Input
                        id='kioskOpLabelRu'
                        className='min-w-0 flex-1'
                        value={c.operatorLabel?.ru ?? ''}
                        onChange={(e) => {
                          setFormValues((p) => {
                            const cur = parseKioskIdentConfigForm(
                              p.kioskIdentificationConfig
                            );
                            return {
                              ...p,
                              kioskIdentificationConfig: {
                                ...cur,
                                operatorLabel: {
                                  ...cur.operatorLabel,
                                  ru: e.target.value
                                }
                              }
                            };
                          });
                        }}
                      />
                      {!kioskCustomLabelEnOpen ? (
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          className='shrink-0'
                          aria-label={tServices('add_language')}
                          onClick={() => setKioskCustomLabelEnOpen(true)}
                        >
                          <Plus className='size-4' />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {kioskCustomLabelEnOpen ? (
                    <div className='space-y-1.5'>
                      <div className='flex items-center justify-between gap-2'>
                        <Label htmlFor='kioskOpLabelEn'>
                          {tServices('kiosk_custom_label_en', {
                            defaultValue: 'Field label (EN)'
                          })}
                        </Label>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='text-muted-foreground size-8 shrink-0'
                          aria-label={tServices('remove_english_block')}
                          onClick={() => {
                            setKioskCustomLabelEnOpen(false);
                            setFormValues((p) => {
                              const cur = parseKioskIdentConfigForm(
                                p.kioskIdentificationConfig
                              );
                              return {
                                ...p,
                                kioskIdentificationConfig: {
                                  ...cur,
                                  operatorLabel: {
                                    ...cur.operatorLabel,
                                    en: ''
                                  }
                                }
                              };
                            });
                          }}
                        >
                          <X className='size-4' />
                        </Button>
                      </div>
                      <Input
                        id='kioskOpLabelEn'
                        value={c.operatorLabel?.en ?? ''}
                        onChange={(e) => {
                          setFormValues((p) => {
                            const cur = parseKioskIdentConfigForm(
                              p.kioskIdentificationConfig
                            );
                            return {
                              ...p,
                              kioskIdentificationConfig: {
                                ...cur,
                                operatorLabel: {
                                  ...cur.operatorLabel,
                                  en: e.target.value
                                }
                              }
                            };
                          });
                        }}
                      />
                    </div>
                  ) : null}
                  <div className='space-y-1.5'>
                    <Label htmlFor='kioskUserInstrRu'>
                      {tServices('kiosk_custom_instruction_ru', {
                        defaultValue: 'User instruction (RU)'
                      })}
                    </Label>
                    <div className='flex items-start gap-2'>
                      <Textarea
                        id='kioskUserInstrRu'
                        className='min-h-24 min-w-0 flex-1'
                        value={c.userInstruction?.ru ?? ''}
                        onChange={(e) => {
                          setFormValues((p) => {
                            const cur = parseKioskIdentConfigForm(
                              p.kioskIdentificationConfig
                            );
                            return {
                              ...p,
                              kioskIdentificationConfig: {
                                ...cur,
                                userInstruction: {
                                  ...cur.userInstruction,
                                  ru: e.target.value
                                }
                              }
                            };
                          });
                        }}
                      />
                      {!kioskCustomInstructionEnOpen ? (
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          className='shrink-0'
                          aria-label={tServices('add_language')}
                          onClick={() => setKioskCustomInstructionEnOpen(true)}
                        >
                          <Plus className='size-4' />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {kioskCustomInstructionEnOpen ? (
                    <div className='space-y-1.5'>
                      <div className='flex items-center justify-between gap-2'>
                        <Label htmlFor='kioskUserInstrEn'>
                          {tServices('kiosk_custom_instruction_en', {
                            defaultValue: 'User instruction (EN)'
                          })}
                        </Label>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='text-muted-foreground size-8'
                          aria-label={tServices('remove_english_block')}
                          onClick={() => {
                            setKioskCustomInstructionEnOpen(false);
                            setFormValues((p) => {
                              const cur = parseKioskIdentConfigForm(
                                p.kioskIdentificationConfig
                              );
                              return {
                                ...p,
                                kioskIdentificationConfig: {
                                  ...cur,
                                  userInstruction: {
                                    ...cur.userInstruction,
                                    en: ''
                                  }
                                }
                              };
                            });
                          }}
                        >
                          <X className='size-4' />
                        </Button>
                      </div>
                      <Textarea
                        id='kioskUserInstrEn'
                        className='min-h-24'
                        value={c.userInstruction?.en ?? ''}
                        onChange={(e) => {
                          setFormValues((p) => {
                            const cur = parseKioskIdentConfigForm(
                              p.kioskIdentificationConfig
                            );
                            return {
                              ...p,
                              kioskIdentificationConfig: {
                                ...cur,
                                userInstruction: {
                                  ...cur.userInstruction,
                                  en: e.target.value
                                }
                              }
                            };
                          });
                        }}
                      />
                    </div>
                  ) : null}
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      id='kioskCustomSkippable'
                      checked={!!c.skippable}
                      onCheckedChange={(v) => {
                        setFormValues((p) => {
                          const cur = parseKioskIdentConfigForm(
                            p.kioskIdentificationConfig
                          );
                          return {
                            ...p,
                            kioskIdentificationConfig: {
                              ...cur,
                              skippable: v === true
                            }
                          };
                        });
                      }}
                    />
                    <Label
                      htmlFor='kioskCustomSkippable'
                      className='font-normal'
                    >
                      {tServices('kiosk_custom_skippable', {
                        defaultValue: 'Can be skipped (Skip button on kiosk)'
                      })}
                    </Label>
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='kioskApiKey'>
                      {tServices('kiosk_custom_api_field', {
                        defaultValue: 'JSON key for the value (apiFieldKey)'
                      })}
                    </Label>
                    <Input
                      id='kioskApiKey'
                      className='font-mono'
                      value={c.apiFieldKey ?? 'value'}
                      onChange={(e) => {
                        setFormValues((p) => {
                          const cur = parseKioskIdentConfigForm(
                            p.kioskIdentificationConfig
                          );
                          return {
                            ...p,
                            kioskIdentificationConfig: {
                              ...cur,
                              apiFieldKey: e.target.value
                            }
                          };
                        });
                      }}
                    />
                  </div>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      id='kioskShowPreview'
                      checked={!!c.showInQueuePreview}
                      onCheckedChange={(v) => {
                        setFormValues((p) => {
                          const cur = parseKioskIdentConfigForm(
                            p.kioskIdentificationConfig
                          );
                          return {
                            ...p,
                            kioskIdentificationConfig: {
                              ...cur,
                              showInQueuePreview: v === true
                            }
                          };
                        });
                      }}
                    />
                    <Label htmlFor='kioskShowPreview' className='font-normal'>
                      {tServices('kiosk_custom_show_in_queue', {
                        defaultValue:
                          'Show value preview in staff queue (with permission)'
                      })}
                    </Label>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      id='kioskSensitive'
                      checked={!!c.sensitive}
                      onCheckedChange={(v) => {
                        setFormValues((p) => {
                          const cur = parseKioskIdentConfigForm(
                            p.kioskIdentificationConfig
                          );
                          return {
                            ...p,
                            kioskIdentificationConfig: {
                              ...cur,
                              sensitive: v === true
                            }
                          };
                        });
                      }}
                    />
                    <Label htmlFor='kioskSensitive' className='font-normal'>
                      {tServices('kiosk_custom_sensitive', {
                        defaultValue:
                          'Sensitive data (DWH/aggregates excluded; retention 1–30d)'
                      })}
                    </Label>
                  </div>
                  {c.sensitive ? (
                    <div className='space-y-1.5'>
                      <Label htmlFor='kioskSensitiveRetention'>
                        {tServices('kiosk_custom_retention_days', {
                          defaultValue: 'Retention (days, 1–30)'
                        })}
                      </Label>
                      <Input
                        id='kioskSensitiveRetention'
                        type='number'
                        min={1}
                        max={30}
                        value={c.retentionDays ?? 7}
                        onChange={(e) => {
                          const n = Math.max(
                            1,
                            Math.min(
                              30,
                              Math.floor(Number(e.target.value) || 7)
                            )
                          );
                          setFormValues((p) => {
                            const cur = parseKioskIdentConfigForm(
                              p.kioskIdentificationConfig
                            );
                            return {
                              ...p,
                              kioskIdentificationConfig: {
                                ...cur,
                                retentionDays: n
                              }
                            };
                          });
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })()}
            <DialogFooter>
              <Button
                type='button'
                onClick={() => setCustomSettingsOpen(false)}
              >
                {tRoot('general.done', { defaultValue: 'Done' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

      {editingService ? (
        <div className='space-y-2'>
          <Label htmlFor='service-sort-order'>
            {tServices('sort_order', { defaultValue: 'Display order' })}
          </Label>
          <Input
            id='service-sort-order'
            name='sortOrder'
            type='number'
            min={0}
            className='max-w-[12rem]'
            value={formValues.sortOrder ?? 0}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setFormValues((prev) => ({
                ...prev,
                sortOrder: Number.isNaN(n) ? 0 : n
              }));
            }}
          />
          <p className='text-muted-foreground text-xs'>
            {tServices('sort_order_help', {
              defaultValue:
                'Lower numbers appear first in lists and on the automatic kiosk layout. New services are appended to the end.'
            })}
          </p>
        </div>
      ) : null}

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
