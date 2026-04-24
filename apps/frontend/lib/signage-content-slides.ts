import type { ContentSlide } from '@/components/screen/content-player';
import type { Material } from '@/lib/api';

export const getSignageActivePlaylistQueryKey = (unitId: string) =>
  ['signage', 'active-playlist', unitId] as const;

/**
 * Same derivation as in {@link useScreenRendererLiveData} — active playlist
 * if source is not `none`, else materials from `adScreen.activeMaterialIds`.
 */
export function deriveContentSlidesFromSignage(
  activePlData: unknown,
  materials: Material[]
): ContentSlide[] {
  const pl = activePlData as
    | {
        source?: string;
        playlist?: {
          items?: Array<{
            id: string;
            duration?: number;
            material?: { type?: string; url?: string };
          }>;
        };
      }
    | undefined;
  if (pl?.source && pl.source !== 'none' && pl.playlist?.items?.length) {
    return pl.playlist.items
      .filter((it) => it.material?.url)
      .map((it) => ({
        id: it.id,
        type: it.material?.type || 'image',
        url: it.material!.url!,
        durationSec: it.duration ?? 0
      }));
  }
  return materials.map((m) => ({
    id: m.id,
    type: m.type,
    url: m.url,
    durationSec: 0
  }));
}
