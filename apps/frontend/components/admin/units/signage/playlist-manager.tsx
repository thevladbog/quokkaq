'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Unit } from '@quokkaq/shared-types';
import * as orval from '@/lib/api/generated/units';
import { unitsApi, Material } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUpdateUnit } from '@/lib/hooks';
import { getGetUnitByIDQueryKey } from '@/lib/api/generated/units';
import { useLegacyPlaylistMigration } from './use-legacy-playlist-migration';
import {
  safeParseSignageWithToast,
  signageZod,
  updatePlaylistRequestSchema
} from '@/lib/signage-zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getCivilYmdInIanaTimeZone,
  slideDateHealth,
  type SlideDateHealth,
  slideDateNeedsAttention
} from '@/lib/signage-date';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { GripVertical, ImageIcon, Search, Video } from 'lucide-react';

const emptyPlaylists: orval.ModelsPlaylist[] = [];

function SortableItem(props: {
  id: string;
  label: string;
  duration: number;
  onDuration: (v: number) => void;
  validFrom: string;
  validTo: string;
  onValidFrom: (v: string) => void;
  onValidTo: (v: string) => void;
  dateLabels: { from: string; to: string };
  dateHealth: SlideDateHealth;
  healthBadge: string;
  className?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: props.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5',
        props.className,
        props.dateHealth === 'expired' && 'border-destructive/50',
        props.dateHealth === 'upcoming' && 'border-amber-500/40',
        props.dateHealth === 'active_expiring' && 'border-amber-500/30'
      )}
    >
      <button
        type='button'
        className='text-muted-foreground touch-none p-1'
        {...attributes}
        {...listeners}
        aria-label='Reorder'
      >
        <GripVertical className='h-4 w-4' />
      </button>
      <span className='min-w-0 flex-1 truncate text-sm'>
        {props.label}
        {props.dateHealth !== 'ok' && props.dateHealth !== 'open' ? (
          <span
            className={cn(
              'ml-1.5 text-[10px] font-semibold uppercase',
              props.dateHealth === 'expired' && 'text-destructive',
              (props.dateHealth === 'upcoming' ||
                props.dateHealth === 'active_expiring') &&
                'text-amber-600 dark:text-amber-400'
            )}
            title={props.healthBadge}
          >
            {props.healthBadge}
          </span>
        ) : null}
      </span>
      <Label className='text-muted-foreground w-20 shrink-0 text-xs'>sec</Label>
      <Input
        className='h-8 w-16'
        type='number'
        min={0}
        value={props.duration}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          props.onDuration(Number.isNaN(n) ? 0 : n);
        }}
      />
      <div className='ml-auto flex flex-col gap-0.5 sm:flex-row sm:items-center'>
        <Input
          className='h-8 w-[9.5rem] text-xs'
          type='date'
          value={props.validFrom}
          title={props.dateLabels.from}
          onChange={(e) => {
            props.onValidFrom(e.target.value);
          }}
        />
        <Input
          className='h-8 w-[9.5rem] text-xs'
          type='date'
          value={props.validTo}
          title={props.dateLabels.to}
          onChange={(e) => {
            props.onValidTo(e.target.value);
          }}
        />
      </div>
    </li>
  );
}

function buildOrderFromItems(rows: orval.ModelsPlaylistItem[] | undefined): {
  orderIds: string[];
  durations: Record<string, number>;
} {
  if (!rows?.length) {
    return { orderIds: [], durations: {} };
  }
  const o = rows
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((i) => i.id ?? '')
    .filter(Boolean) as string[];
  const d: Record<string, number> = {};
  for (const it of rows) {
    if (it.id) d[it.id] = it.duration ?? 10;
  }
  return { orderIds: o, durations: d };
}

function buildItemDateBounds(
  rows: orval.ModelsPlaylistItem[] | undefined
): Record<string, { from: string; to: string }> {
  const o: Record<string, { from: string; to: string }> = {};
  for (const it of rows ?? []) {
    if (!it.id) continue;
    o[it.id] = {
      from: it.validFrom ? it.validFrom.slice(0, 10) : '',
      to: it.validTo ? it.validTo.slice(0, 10) : ''
    };
  }
  return o;
}

function PlaylistOrderPanel(props: {
  itemRows: orval.ModelsPlaylistItem[];
  materials: Material[];
  unit: Unit;
  unitId: string;
  editId: string;
  playlist: orval.ModelsPlaylist;
  updatePl: ReturnType<typeof orval.useUpdateSignagePlaylist>;
  refetchPl: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
  t: (key: string, values?: { default: string }) => string;
}) {
  const {
    itemRows,
    materials,
    unit,
    unitId,
    editId,
    playlist,
    updatePl,
    refetchPl,
    queryClient: qc,
    t
  } = props;
  const [showDateIssues, setShowDateIssues] = useState(false);
  const todayYmd = useMemo(
    () => getCivilYmdInIanaTimeZone(unit.timezone || 'UTC'),
    [unit.timezone]
  );
  const healthBadge = (h: SlideDateHealth) => {
    switch (h) {
      case 'expired':
        return t('slideDateBadgeExpired', { default: 'Expired' });
      case 'upcoming':
        return t('slideDateBadgeUpcoming', { default: 'Upcoming' });
      case 'active_expiring':
        return t('slideDateBadgeExpiring', { default: '≤7d' });
      default:
        return '';
    }
  };

  const [orderIds, setOrderIds] = useState(
    () => buildOrderFromItems(itemRows).orderIds
  );
  const [durations, setDurations] = useState(
    () => buildOrderFromItems(itemRows).durations
  );
  const [itemDates, setItemDates] = useState(() =>
    buildItemDateBounds(itemRows)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrderIds((o) => {
      const oldIndex = o.indexOf(String(active.id));
      const newIndex = o.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return o;
      return arrayMove(o, oldIndex, newIndex);
    });
  };

  const onSaveOrder = async () => {
    const its = orderIds.map((id, i) => {
      const it = itemRows.find((x) => x.id === id);
      const matId = it?.materialId ?? it?.material?.id ?? '';
      const bd = itemDates[id] ?? { from: '', to: '' };
      return {
        materialId: matId,
        sortOrder: i,
        duration: durations[id] ?? 10,
        validFrom: bd.from.trim() || undefined,
        validTo: bd.to.trim() || undefined
      } as orval.HandlersPlaylistItemInput;
    });
    const data = {
      name: playlist.name ?? '',
      isDefault: playlist.isDefault,
      items: its
    };
    if (
      !safeParseSignageWithToast(
        'Playlist update',
        updatePlaylistRequestSchema,
        data
      ).success
    ) {
      return;
    }
    try {
      await updatePl.mutateAsync({
        unitId,
        playlistId: editId,
        data
      });
      void refetchPl();
      void qc.invalidateQueries({
        queryKey: orval.getGetSignagePlaylistQueryKey(unitId, editId)
      });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const byMatId = (mid: string) =>
    materials.find((m) => m.id === mid)?.filename ?? mid;

  return (
    <div className='space-y-2 rounded-lg border p-3'>
      <Label>
        {t('reorderSave', {
          default:
            'Drag to reorder, set duration and optional slide date range, then save'
        })}
      </Label>
      <div className='flex items-center gap-2 text-sm'>
        <Checkbox
          id={`signage-date-filter-${editId}`}
          checked={showDateIssues}
          onCheckedChange={(c) => setShowDateIssues(Boolean(c))}
        />
        <Label
          htmlFor={`signage-date-filter-${editId}`}
          className='text-muted-foreground cursor-pointer font-normal'
        >
          {t('showSlideDateWarningsOnly', {
            default:
              'Show only slides with date warnings (vs today, unit timezone)'
          })}
        </Label>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={orderIds}
          strategy={verticalListSortingStrategy}
        >
          <ul className='space-y-1'>
            {orderIds.map((pid) => {
              const it = itemRows.find((r) => r.id === pid);
              const matId =
                it?.materialId ??
                (it as { material?: { id?: string } })?.material?.id;
              const b = itemDates[pid] ?? { from: '', to: '' };
              const dh = slideDateHealth(b.from, b.to, todayYmd);
              const hide = showDateIssues && !slideDateNeedsAttention(dh);
              return (
                <SortableItem
                  key={pid}
                  className={hide ? 'hidden' : undefined}
                  id={pid}
                  label={matId ? byMatId(matId) : pid}
                  duration={durations[pid] ?? 10}
                  onDuration={(v) => setDurations((d) => ({ ...d, [pid]: v }))}
                  validFrom={b.from}
                  validTo={b.to}
                  onValidFrom={(v) => {
                    setItemDates((prev) => {
                      const cur = prev[pid] ?? { from: '', to: '' };
                      return { ...prev, [pid]: { ...cur, from: v } };
                    });
                  }}
                  onValidTo={(v) => {
                    setItemDates((prev) => {
                      const cur = prev[pid] ?? { from: '', to: '' };
                      return { ...prev, [pid]: { ...cur, to: v } };
                    });
                  }}
                  dateHealth={dh}
                  healthBadge={healthBadge(dh)}
                  dateLabels={{
                    from: t('itemValidFrom', { default: 'Valid from' }),
                    to: t('itemValidTo', { default: 'Valid to' })
                  }}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <Button type='button' onClick={() => void onSaveOrder()}>
        {t('saveOrder', { default: 'Save order' })}
      </Button>
    </div>
  );
}

export function PlaylistManager({
  unit,
  unitId
}: {
  unit: Unit;
  unitId: string;
}) {
  const t = useTranslations('admin.signage');
  const qc = useQueryClient();
  const updateUnit = useUpdateUnit();

  const { data: materials = [] } = useQuery({
    queryKey: ['unit-materials', unitId],
    queryFn: () => unitsApi.getMaterials(unitId)
  });

  const {
    data: playlistsRes,
    isSuccess: playlistsSuccess,
    refetch: refetchPl
  } = orval.useListSignagePlaylists(unitId);
  const playlists: orval.ModelsPlaylist[] =
    playlistsRes?.data ?? emptyPlaylists;

  const [plName, setPlName] = useState('');
  const [selIds, setSelIds] = useState<string[]>([]);
  const [materialQuery, setMaterialQuery] = useState('');

  const filteredMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.filename.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
  }, [materials, materialQuery]);
  const createPl = orval.useCreateSignagePlaylist();
  const deletePl = orval.useDeleteSignagePlaylist();
  const updatePl = orval.useUpdateSignagePlaylist();

  const [editId, setEditId] = useState<string>('');
  const { data: detail } = orval.useGetSignagePlaylist(unitId, editId, {
    query: { enabled: !!editId }
  });
  const playlist = detail?.data as orval.ModelsPlaylist | undefined;
  const items = playlist?.items;

  const itemRows = items ?? [];
  const itemFingerprint = itemRows
    .map(
      (i) =>
        `${i.id ?? ''}-${i.sortOrder ?? 0}-${i.duration ?? 0}-${i.validFrom ?? ''}-${i.validTo ?? ''}`
    )
    .join(',');

  useLegacyPlaylistMigration({
    unit,
    unitId,
    playlists,
    isPlaylistsSuccess: playlistsSuccess,
    createPlaylist: (args) => createPl.mutateAsync(args),
    patchUnitConfig: async (fullConfig) => {
      await updateUnit.mutateAsync({
        id: unitId,
        config: fullConfig as Unit['config']
      });
      void qc.invalidateQueries({
        queryKey: getGetUnitByIDQueryKey(unitId)
      });
      void refetchPl();
      toast.success(t('saved', { default: 'Saved' }));
    },
    onDone: () => {
      void refetchPl();
    }
  });

  const onCreatePlaylist = async () => {
    if (!plName.trim()) {
      toast.error(t('playlistNameRequired', { default: 'Name is required' }));
      return;
    }
    if (selIds.length === 0) {
      toast.error(
        t('selectMaterials', { default: 'Select at least one material' })
      );
      return;
    }
    const body = {
      name: plName.trim(),
      items: selIds.map((id) => ({ materialId: id, duration: 10 })),
      isDefault: false
    };
    if (
      !safeParseSignageWithToast('Playlist', signageZod.createPlaylist, body)
        .success
    ) {
      return;
    }
    try {
      await createPl.mutateAsync({
        unitId,
        data: body as orval.HandlersCreatePlaylistRequest
      });
      setPlName('');
      setSelIds([]);
      void refetchPl();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onDeletePlaylist = async (id: string) => {
    if (
      !window.confirm(
        t('confirmDeletePlaylist', { default: 'Delete this playlist?' })
      )
    )
      return;
    try {
      await deletePl.mutateAsync({ unitId, playlistId: id });
      if (editId === id) setEditId('');
      void refetchPl();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className='space-y-3'>
      <div className='space-y-2 rounded-lg border p-3'>
        <Label>{t('newPlaylist', { default: 'New playlist' })}</Label>
        <Input
          value={plName}
          onChange={(e) => setPlName(e.target.value)}
          placeholder={t('newPlaylistNamePlaceholder', { default: 'Name' })}
        />
        {materials.length > 0 ? (
          <div className='space-y-2'>
            <div className='relative'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
              <Input
                value={materialQuery}
                onChange={(e) => setMaterialQuery(e.target.value)}
                className='pl-8'
                placeholder={t('materialSearchPlaceholder', {
                  default: 'Search by file name…'
                })}
              />
            </div>
            {filteredMaterials.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('materialSearchNoMatch', {
                  default: 'No files match your search'
                })}
              </p>
            ) : (
              <div
                className='max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-1.5'
                role='list'
              >
                {filteredMaterials.map((m: Material) => {
                  const checked = selIds.includes(m.id);
                  const cbId = `pl-new-mat-${m.id}`;
                  return (
                    <div
                      key={m.id}
                      className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1.5'
                      role='listitem'
                    >
                      <Checkbox
                        id={cbId}
                        checked={checked}
                        onCheckedChange={(c) => {
                          const on = c === true;
                          if (on) {
                            setSelIds((s) =>
                              s.includes(m.id) ? s : [...s, m.id]
                            );
                          } else {
                            setSelIds((s) => s.filter((x) => x !== m.id));
                          }
                        }}
                        aria-label={m.filename}
                      />
                      <div
                        className='bg-muted relative h-10 w-14 shrink-0 overflow-hidden rounded border'
                        aria-hidden
                      >
                        {m.type === 'image' && m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.url}
                            alt=''
                            className='h-full w-full object-cover'
                          />
                        ) : m.type === 'image' ? (
                          <div className='text-muted-foreground flex h-full items-center justify-center'>
                            <ImageIcon className='h-5 w-5' />
                          </div>
                        ) : (
                          <div className='text-muted-foreground flex h-full items-center justify-center'>
                            <Video className='h-5 w-5' />
                          </div>
                        )}
                      </div>
                      <label
                        htmlFor={cbId}
                        className='min-w-0 flex-1 cursor-pointer truncate text-sm'
                        title={m.filename}
                      >
                        {m.filename}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
        <Button
          onClick={() => {
            void onCreatePlaylist();
          }}
        >
          {t('create', { default: 'Create' })}
        </Button>
      </div>

      <ul className='space-y-1'>
        {playlists.map((p) => (
          <li
            key={p.id}
            className='flex items-center justify-between border-b py-1'
          >
            <span>{p.name}</span>
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  setEditId(p.id ?? '');
                }}
              >
                {t('editOrder', { default: 'Order' })}
              </Button>
              <Button
                type='button'
                variant='destructive'
                size='sm'
                onClick={() => {
                  void onDeletePlaylist(p.id!);
                }}
              >
                {t('playlistDelete', { default: 'Delete' })}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editId && playlist && itemRows.length > 0 && (
        <PlaylistOrderPanel
          key={`${editId}-${itemFingerprint}`}
          itemRows={itemRows as orval.ModelsPlaylistItem[]}
          materials={materials}
          unit={unit}
          unitId={unitId}
          editId={editId}
          playlist={playlist}
          updatePl={updatePl}
          refetchPl={refetchPl}
          queryClient={qc}
          t={t}
        />
      )}
    </div>
  );
}
