'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContentSlide } from '@/components/screen/content-player';
import { unitsApi, type Material, type UnitConfig } from '@/lib/api';
import { logger } from '@/lib/logger';
import { resolveKioskAttractSignageMode } from '@/lib/kiosk-attract-config';
import {
  deriveContentSlidesFromSignage,
  getSignageActivePlaylistQueryKey
} from '@/lib/signage-content-slides';

type Unitish = {
  config?: unknown;
} | null;

function orderMaterialsByIdOrder(
  all: Material[],
  idOrder: string[]
): Material[] {
  const map = new Map(all.map((m) => [m.id, m]));
  return idOrder
    .map((id) => map.get(id))
    .filter((m): m is Material => m != null);
}

/**
 * Slides for the kiosk attract screen. May use the same pipeline as the queue
 * display (`inherit`) or overrides from {@link KioskConfig}.
 */
export function useSignageContentSlides(
  apiUnitId: string | undefined,
  unit: Unitish
) {
  const k = (unit?.config as UnitConfig | undefined)?.kiosk;
  const mode = resolveKioskAttractSignageMode(k);
  const playlistId = k?.kioskAttractPlaylistId?.trim() || '';

  const { data: activePlData } = useQuery({
    queryKey: getSignageActivePlaylistQueryKey(apiUnitId ?? ''),
    queryFn: () => unitsApi.getActivePlaylist(apiUnitId!),
    enabled: Boolean(apiUnitId) && mode === 'inherit',
    refetchInterval: 60_000
  });

  const { data: customPlaylist } = useQuery({
    queryKey: [
      'signage',
      'playlist-public',
      apiUnitId ?? '',
      mode === 'playlist' ? playlistId : ''
    ] as const,
    queryFn: () => unitsApi.getSignagePlaylistPublic(apiUnitId!, playlistId),
    enabled: Boolean(apiUnitId) && mode === 'playlist' && Boolean(playlistId),
    refetchInterval: 60_000
  });

  const [materials, setMaterials] = useState<Material[]>([]);

  useEffect(() => {
    let isMounted = true;
    if (!apiUnitId || !unit) {
      setMaterials([]);
      return;
    }
    const m = resolveKioskAttractSignageMode(
      (unit.config as UnitConfig | undefined)?.kiosk
    );
    const run = async () => {
      try {
        const allMaterials = await unitsApi.getMaterials(apiUnitId);
        if (!isMounted) {
          return;
        }
        if (m === 'inherit') {
          const adConfig = (unit.config as UnitConfig | undefined)?.adScreen;
          const activeIds = adConfig?.activeMaterialIds || [];
          setMaterials(
            allMaterials.filter((mat: Material) => activeIds.includes(mat.id))
          );
        } else if (m === 'materials') {
          const ids =
            (unit.config as UnitConfig | undefined)?.kiosk
              ?.kioskAttractActiveMaterialIds || [];
          setMaterials(orderMaterialsByIdOrder(allMaterials, ids));
        } else {
          setMaterials([]);
        }
      } catch (e) {
        logger.error('useSignageContentSlides: getMaterials failed', e);
      }
    };
    void run();
    const interval = setInterval(() => {
      void run();
    }, 60_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiUnitId, unit]);

  const contentSlides: ContentSlide[] = useMemo(() => {
    if (mode === 'playlist' && customPlaylist) {
      return deriveContentSlidesFromSignage(
        { source: 'default', playlist: customPlaylist },
        []
      );
    }
    if (mode === 'playlist' && !customPlaylist) {
      return [];
    }
    if (mode === 'materials') {
      return materials.map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        durationSec: 0
      }));
    }
    return deriveContentSlidesFromSignage(activePlData, materials);
  }, [mode, customPlaylist, activePlData, materials]);

  const defaultImageSeconds = useMemo(() => {
    const c = unit?.config as UnitConfig | undefined;
    const d = c?.kiosk?.kioskAttractSlideDurationSec;
    if (d != null && d > 0) {
      return d;
    }
    return c?.adScreen?.duration || 5;
  }, [unit]);

  return { contentSlides, defaultImageSeconds };
}
