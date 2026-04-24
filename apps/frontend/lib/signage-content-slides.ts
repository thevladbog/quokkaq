import type { ContentSlide } from '@/components/screen/content-player';
import type { Material } from '@/lib/api';
import type { ServicesActivePlaylistDTO } from '@/lib/api/generated/units';

export const getSignageActivePlaylistQueryKey = (unitId: string) =>
  ['signage', 'active-playlist', unitId] as const;

/** React Query key for public branch playlist fetches (kiosk attract, `playlist` mode). */
export const getSignagePlaylistPublicQueryKey = (
  unitId: string,
  playlistId: string
) => ['signage', 'playlist-public', unitId, playlistId] as const;

/**
 * API unit for signage fetches. Service-zone kiosks use the branch (parent) library
 * and playlists; falls back to `apiUnitId` when `parentId` is missing.
 */
export function resolveKioskSignageUnitId(
  apiUnitId: string | undefined,
  unit: { kind?: string; parentId?: string | null } | null | undefined
): string | undefined {
  if (!apiUnitId) {
    return undefined;
  }
  if (unit?.kind === 'service_zone' && unit.parentId) {
    return unit.parentId;
  }
  return apiUnitId;
}

/**
 * Same derivation as in {@link useScreenRendererLiveData} — active playlist
 * if source is not `none`, else materials from `adScreen.activeMaterialIds`.
 */
export function deriveContentSlidesFromSignage(
  activePlData: ServicesActivePlaylistDTO | undefined,
  materials: Material[]
): ContentSlide[] {
  const pl = activePlData;
  if (pl?.source && pl.source !== 'none' && pl.playlist?.items?.length) {
    return pl.playlist.items.flatMap((it) => {
      const id = it.id;
      const url = it.material?.url;
      if (!id || !url) {
        return [];
      }
      return [
        {
          id,
          type: it.material?.type ?? 'image',
          url,
          durationSec: it.duration ?? 0
        }
      ];
    });
  }
  return materials.map((m) => ({
    id: m.id,
    type: m.type,
    url: m.url,
    durationSec: 0
  }));
}
