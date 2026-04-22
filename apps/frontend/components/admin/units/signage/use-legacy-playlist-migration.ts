import { useEffect, useRef } from 'react';
import type { Unit } from '@quokkaq/shared-types';

type MinimalPlaylist = { id?: string };

/**
 * When the unit has legacy `adScreen.activeMaterialIds` but no playlists yet, create a default
 * playlist once and set `config.signage.legacyActiveMaterialsImportedAt`.
 */
export function useLegacyPlaylistMigration(params: {
  unit: Unit;
  unitId: string;
  playlists: MinimalPlaylist[] | undefined;
  isPlaylistsSuccess: boolean;
  createPlaylist: (args: {
    unitId: string;
    data: {
      name: string;
      isDefault?: boolean;
      items: { materialId: string; duration: number }[];
    };
  }) => Promise<unknown>;
  patchUnitConfig: (config: Record<string, unknown>) => void;
  onDone: () => void;
}): void {
  const {
    unit,
    unitId,
    playlists,
    isPlaylistsSuccess,
    createPlaylist,
    patchUnitConfig,
    onDone
  } = params;
  const ran = useRef(false);

  useEffect(() => {
    if (!isPlaylistsSuccess || ran.current) return;
    const cfg = unit.config;
    if (!cfg || typeof cfg !== 'object') return;
    const rec = cfg as Record<string, unknown>;
    const signage = rec.signage as
      | { legacyActiveMaterialsImportedAt?: string }
      | undefined;
    if (signage?.legacyActiveMaterialsImportedAt) return;
    if (playlists && playlists.length > 0) return;
    const ad = rec.adScreen as
      | { activeMaterialIds?: string[]; duration?: number }
      | undefined;
    const ids = ad?.activeMaterialIds?.filter(Boolean) ?? [];
    if (ids.length === 0) return;
    const duration = typeof ad?.duration === 'number' ? ad.duration : 10;
    ran.current = true;
    void (async () => {
      try {
        await createPlaylist({
          unitId,
          data: {
            name: 'Default',
            isDefault: true,
            items: ids.map((materialId) => ({ materialId, duration }))
          }
        });
        patchUnitConfig({
          ...rec,
          signage: {
            ...(typeof signage === 'object' && signage ? signage : {}),
            legacyActiveMaterialsImportedAt: new Date().toISOString()
          }
        });
        onDone();
      } catch {
        ran.current = false;
      }
    })();
  }, [
    unit,
    unitId,
    playlists,
    isPlaylistsSuccess,
    createPlaylist,
    patchUnitConfig,
    onDone
  ]);
}
