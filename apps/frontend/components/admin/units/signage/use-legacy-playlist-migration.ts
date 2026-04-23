import { useEffect, useRef } from 'react';
import type { Unit } from '@quokkaq/shared-types';
import { isApiHttpError } from '@/lib/api-errors';

type MinimalPlaylist = { id?: string };

function isDuplicateDefaultConflict(e: unknown): boolean {
  return isApiHttpError(e) && e.status === 409;
}

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
  /** Must complete only after the unit has been persisted with `legacyActiveMaterialsImportedAt`. */
  patchUnitConfig: (config: Record<string, unknown>) => Promise<void> | void;
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
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isPlaylistsSuccess || ran.current || inFlight.current) return;
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

    const markImportedConfig: Record<string, unknown> = {
      ...rec,
      signage: {
        ...(typeof signage === 'object' && signage ? signage : {}),
        legacyActiveMaterialsImportedAt: new Date().toISOString()
      }
    };

    inFlight.current = true;
    ran.current = true;
    void (async () => {
      const finishPatch = async () => {
        await Promise.resolve(patchUnitConfig(markImportedConfig));
        onDone();
      };
      try {
        await createPlaylist({
          unitId,
          data: {
            name: 'Default',
            isDefault: true,
            items: ids.map((materialId) => ({ materialId, duration }))
          }
        });
        await finishPatch();
      } catch (e) {
        if (isDuplicateDefaultConflict(e)) {
          try {
            await finishPatch();
          } catch {
            ran.current = false;
          }
        } else {
          ran.current = false;
        }
      } finally {
        inFlight.current = false;
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
