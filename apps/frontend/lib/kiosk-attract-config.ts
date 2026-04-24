import type {
  KioskAttractInactivityMode,
  KioskConfig
} from '@quokkaq/shared-types';

export type KioskAttractSignageMode = 'inherit' | 'playlist' | 'materials';

/**
 * Resolves which signage pipeline the kiosk attract screen should use. Treats
 * `playlist` without a playlist id as `inherit` so misconfigured saves do not
 * show an empty screen forever.
 */
export function resolveKioskAttractSignageMode(
  k: KioskConfig | undefined
): KioskAttractSignageMode {
  if (k?.kioskAttractSignageMode === 'materials') {
    return 'materials';
  }
  if (
    k?.kioskAttractSignageMode === 'playlist' &&
    k.kioskAttractPlaylistId &&
    k.kioskAttractPlaylistId.trim() !== ''
  ) {
    return 'playlist';
  }
  return 'inherit';
}

export function getKioskAttractMode(
  k: KioskConfig | undefined
): KioskAttractInactivityMode {
  return k?.kioskAttractInactivityMode ?? 'session_then_attract';
}

export function getShowAttractAfterSessionEnd(
  k: KioskConfig | undefined
): boolean {
  return k?.showAttractAfterSessionEnd !== false;
}

export function getAttractIdleSec(k: KioskConfig | undefined): number {
  return Math.min(600, Math.max(10, k?.attractIdleSec ?? 60));
}

export function getShowQueueDepthOnAttract(
  k: KioskConfig | undefined
): boolean {
  return k?.showQueueDepthOnAttract !== false;
}
