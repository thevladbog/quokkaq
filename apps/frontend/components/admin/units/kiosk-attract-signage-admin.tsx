'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ImageIcon, Search, Video } from 'lucide-react';
import { listSignagePlaylists } from '@/lib/api/generated/units';
import { unitsApi } from '@/lib/api';
import { getGetUnitsUnitIdMaterialsQueryKey } from '@/lib/api/generated/units';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Link } from '@/src/i18n/navigation';
import type { KioskAttractSignageMode } from '@/lib/kiosk-attract-config';

function toggleMaterialId(current: string[], id: string): string[] {
  if (current.includes(id)) {
    return current.filter((x) => x !== id);
  }
  return [...current, id];
}

export function KioskAttractSignageAdminBlock(props: {
  branchUnitId: string;
  linkUnitId: string;
  value: {
    mode: KioskAttractSignageMode;
    playlistId: string;
    materialIds: string[];
    slideDurationSec: number | '';
  };
  onChange: (value: {
    mode: KioskAttractSignageMode;
    playlistId: string;
    materialIds: string[];
    slideDurationSec: number | '';
  }) => void;
}) {
  const { branchUnitId, linkUnitId, value, onChange } = props;
  const t = useTranslations('admin.kiosk_settings');
  const tDisplay = useTranslations('admin.display');
  const [q, setQ] = useState('');

  const { data: playlists = [] } = useQuery({
    queryKey: ['kioskAdmin', 'playlists', branchUnitId] as const,
    queryFn: async () => {
      const r = await listSignagePlaylists(branchUnitId);
      if (r.status !== 200) {
        return [];
      }
      return r.data ?? [];
    },
    enabled: Boolean(branchUnitId) && value.mode === 'playlist'
  });

  const { data: materials = [] } = useQuery({
    queryKey: getGetUnitsUnitIdMaterialsQueryKey(branchUnitId),
    queryFn: () => unitsApi.getMaterials(branchUnitId),
    enabled: Boolean(branchUnitId) && value.mode === 'materials'
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) {
      return materials;
    }
    return materials.filter((m) =>
      (m.filename || '').toLowerCase().includes(s)
    );
  }, [materials, q]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('attract_signage_section_title')}</CardTitle>
        <CardDescription>{t('attract_signage_section_desc')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <Label>{t('attract_signage_mode_label')}</Label>
          <Select
            value={value.mode}
            onValueChange={(v) => {
              onChange({
                ...value,
                mode: v as KioskAttractSignageMode
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='inherit'>
                {t('attract_signage_mode_inherit')}
              </SelectItem>
              <SelectItem value='playlist'>
                {t('attract_signage_mode_playlist')}
              </SelectItem>
              <SelectItem value='materials'>
                {t('attract_signage_mode_materials')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.mode === 'inherit' ? (
          <p className='text-muted-foreground text-sm'>
            {t('attract_signage_inherit_hint')}{' '}
            <Link
              className='text-foreground font-medium underline underline-offset-2'
              href={`/settings/units/${linkUnitId}?display=content`}
            >
              {t('attract_signage_info_link')}
            </Link>
          </p>
        ) : null}

        {value.mode === 'playlist' ? (
          <div className='space-y-2'>
            <Label htmlFor='kiosk-attract-pl'>
              {t('attract_signage_playlist_label')}
            </Label>
            {playlists.length > 0 ? (
              <Select
                value={value.playlistId}
                onValueChange={(v) => onChange({ ...value, playlistId: v })}
              >
                <SelectTrigger id='kiosk-attract-pl'>
                  <SelectValue
                    placeholder={t('attract_signage_playlist_placeholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {playlists
                    .filter((p) => p.id)
                    .map((p) => (
                      <SelectItem key={p.id!} value={p.id!}>
                        {p.name || p.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t('attract_signage_no_playlists')}{' '}
                <Link
                  className='text-foreground font-medium underline underline-offset-2'
                  href={`/settings/units/${linkUnitId}?display=content`}
                >
                  {tDisplay('sub.content', { default: 'Playlists' })}
                </Link>
              </p>
            )}
            <p className='text-muted-foreground text-xs'>
              {t('attract_signage_playlist_help')}
            </p>
          </div>
        ) : null}

        {value.mode === 'materials' ? (
          <div className='space-y-2'>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <Label>{t('attract_signage_materials_label')}</Label>
                <p className='text-muted-foreground text-xs'>
                  {t('attract_signage_materials_desc')}
                </p>
              </div>
              <Button size='sm' variant='outline' asChild>
                <Link href={`/settings/units/${linkUnitId}?display=materials`}>
                  {tDisplay('openMediaLibrary', { default: 'Media library' })}
                </Link>
              </Button>
            </div>
            {materials.length > 0 ? (
              <div className='relative max-w-md'>
                <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
                <Input
                  className='pl-8'
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={tDisplay('fallbackSearchPlaceholder', {
                    default: 'Filter by name…'
                  })}
                />
              </div>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t('attract_signage_no_materials_branch')}
              </p>
            )}
            {materials.length > 0 && filtered.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {tDisplay('fallbackSearchNoMatch', { default: 'No matches' })}
              </p>
            ) : null}
            {materials.length > 0 && filtered.length > 0 ? (
              <div className='max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-1.5'>
                {filtered.map((material) => {
                  const cb = `kiosk-as-${material.id}`;
                  return (
                    <div
                      key={material.id}
                      className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1.5'
                    >
                      <Checkbox
                        id={cb}
                        checked={value.materialIds.includes(material.id)}
                        onCheckedChange={() => {
                          onChange({
                            ...value,
                            materialIds: toggleMaterialId(
                              value.materialIds,
                              material.id
                            )
                          });
                        }}
                        aria-label={material.filename}
                      />
                      <div
                        className='bg-muted relative h-9 w-12 shrink-0 overflow-hidden rounded border'
                        aria-hidden
                      >
                        {material.type === 'image' && material.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={material.url}
                            alt=''
                            className='h-full w-full object-cover'
                          />
                        ) : material.type === 'image' ? (
                          <div className='text-muted-foreground flex h-full items-center justify-center'>
                            <ImageIcon className='h-4 w-4' />
                          </div>
                        ) : (
                          <div className='text-muted-foreground flex h-full items-center justify-center'>
                            <Video className='h-4 w-4' />
                          </div>
                        )}
                      </div>
                      <label
                        htmlFor={cb}
                        className='min-w-0 flex-1 cursor-pointer truncate text-sm'
                        title={material.filename}
                      >
                        {material.filename}
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className='max-w-sm space-y-1.5'>
          <Label htmlFor='kiosk-attract-slide-sec'>
            {t('attract_signage_duration_label')}
          </Label>
          <Input
            id='kiosk-attract-slide-sec'
            type='number'
            min={1}
            max={300}
            value={value.slideDurationSec === '' ? '' : value.slideDurationSec}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                onChange({ ...value, slideDurationSec: '' });
                return;
              }
              const n = Math.min(300, Math.max(1, parseInt(raw, 10) || 1));
              onChange({ ...value, slideDurationSec: n });
            }}
            placeholder='5'
          />
          <p className='text-muted-foreground text-xs'>
            {t('attract_signage_duration_help')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
