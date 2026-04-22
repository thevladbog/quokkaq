'use client';

import { useState } from 'react';
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
import { safeParseSignageWithToast, signageZod } from '@/lib/signage-zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { GripVertical } from 'lucide-react';

function SortableItem(props: {
  id: string;
  label: string;
  duration: number;
  onDuration: (v: number) => void;
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
      className='bg-card flex items-center gap-2 rounded-md border px-2 py-1.5'
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
      <span className='min-w-0 flex-1 truncate text-sm'>{props.label}</span>
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

function PlaylistOrderPanel(props: {
  itemRows: orval.ModelsPlaylistItem[];
  materials: Material[];
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
    unitId,
    editId,
    playlist,
    updatePl,
    refetchPl,
    queryClient: qc,
    t
  } = props;

  const [orderIds, setOrderIds] = useState(
    () => buildOrderFromItems(itemRows).orderIds
  );
  const [durations, setDurations] = useState(
    () => buildOrderFromItems(itemRows).durations
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
      return {
        materialId: matId,
        sortOrder: i,
        duration: durations[id] ?? 10
      } as orval.HandlersPlaylistItemInput;
    });
    try {
      await updatePl.mutateAsync({
        unitId,
        playlistId: editId,
        data: {
          name: playlist.name,
          isDefault: playlist.isDefault,
          items: its
        }
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
          default: 'Drag to reorder, adjust duration, then save'
        })}
      </Label>
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
              return (
                <SortableItem
                  key={pid}
                  id={pid}
                  label={matId ? byMatId(matId) : pid}
                  duration={durations[pid] ?? 10}
                  onDuration={(v) => setDurations((d) => ({ ...d, [pid]: v }))}
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
    data: playlists,
    isSuccess: playlistsSuccess,
    refetch: refetchPl
  } = orval.useListSignagePlaylists(unitId);

  const [plName, setPlName] = useState('');
  const [selIds, setSelIds] = useState<string[]>([]);
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
    .map((i) => `${i.id ?? ''}-${i.sortOrder ?? 0}-${i.duration ?? 0}`)
    .join(',');

  useLegacyPlaylistMigration({
    unit,
    unitId,
    playlists: playlists as orval.ModelsPlaylist[] | undefined,
    isPlaylistsSuccess: playlistsSuccess,
    createPlaylist: (args) => createPl.mutateAsync(args),
    patchUnitConfig: (fullConfig) => {
      updateUnit.mutate(
        { id: unitId, config: fullConfig as Unit['config'] },
        {
          onSuccess: () => {
            void qc.invalidateQueries({
              queryKey: getGetUnitByIDQueryKey(unitId)
            });
            void refetchPl();
            toast.success(t('saved', { default: 'Saved' }));
          }
        }
      );
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
    if (!window.confirm('Delete?')) return;
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
          placeholder='Name'
        />
        <div className='grid max-h-48 grid-cols-2 gap-2 overflow-y-auto'>
          {materials.map((m: Material) => (
            <label key={m.id} className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={selIds.includes(m.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelIds((s) => [...s, m.id]);
                  } else {
                    setSelIds((s) => s.filter((x) => x !== m.id));
                  }
                }}
              />
              <span className='truncate'>{m.filename}</span>
            </label>
          ))}
        </div>
        <Button
          onClick={() => {
            void onCreatePlaylist();
          }}
        >
          {t('create', { default: 'Create' })}
        </Button>
      </div>

      <ul className='space-y-1'>
        {((playlists as orval.ModelsPlaylist[] | undefined) ?? []).map((p) => (
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
                Delete
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
