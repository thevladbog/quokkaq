'use client';

import {
  hasLegacyKioskPrintFields,
  KioskTauriLocalDeviceV1Schema,
  type KioskConfig,
  type KioskConfigForDeviceRuntime,
  type KioskTauriLocalDeviceV1,
  migrateKioskTauriLocalFromServerKiosk
} from '@quokkaq/shared-types';

const STORAGE_KEY_PREFIX = 'qkq.tauriKiosk.v1' as const;

/** Fire after any write so open kiosk page refreshes {@link readKioskTauriLocalDevice} in useMemo. */
export const KIOSK_TAURI_DEVICE_CHANGED_EVENT = 'quokkaq:kiosk-tauri-device';

function emitKioskTauriDeviceChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(KIOSK_TAURI_DEVICE_CHANGED_EVENT));
}

const LEGACY_SERIAL_PATH = 'kioskSerialPath';
const LEGACY_SERIAL_BAUD = 'kioskSerialBaud';

function storageKey(unitId: string): string {
  return `${STORAGE_KEY_PREFIX}:${unitId.trim()}`;
}

/**
 * @internal Read+parse. Returns null if empty or invalid.
 */
export function readKioskTauriLocalDevice(
  unitId: string
): KioskTauriLocalDeviceV1 | null {
  if (typeof window === 'undefined' || !unitId.trim()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(unitId));
    if (!raw?.trim()) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const r = KioskTauriLocalDeviceV1Schema.safeParse(parsed);
    if (!r.success) {
      return null;
    }
    if (r.data.unitId !== unitId) {
      return null;
    }
    return r.data;
  } catch {
    return null;
  }
}

export function writeKioskTauriLocalDevice(
  next: KioskTauriLocalDeviceV1
): void {
  if (typeof window === 'undefined' || !next.unitId.trim()) {
    return;
  }
  const r = KioskTauriLocalDeviceV1Schema.safeParse(next);
  if (!r.success) {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey(r.data.unitId),
      JSON.stringify(r.data)
    );
    emitKioskTauriDeviceChanged();
  } catch {
    // quota / private mode
  }
}

export function patchKioskTauriLocalDevice(
  unitId: string,
  patch: Partial<Omit<KioskTauriLocalDeviceV1, 'v' | 'unitId'>>
): KioskTauriLocalDeviceV1 {
  const prev = readKioskTauriLocalDevice(unitId) ?? { v: 1 as const, unitId };
  return {
    v: 1,
    unitId: unitId.trim(),
    isPrintEnabled: patch.isPrintEnabled ?? prev.isPrintEnabled,
    isAlwaysPrintTicket: patch.isAlwaysPrintTicket ?? prev.isAlwaysPrintTicket,
    printerConnection: patch.printerConnection ?? prev.printerConnection,
    systemPrinterName: patch.systemPrinterName ?? prev.systemPrinterName,
    printerIp: patch.printerIp ?? prev.printerIp,
    printerPort: patch.printerPort ?? prev.printerPort,
    printerType: patch.printerType ?? prev.printerType,
    printerLogoUrl: patch.printerLogoUrl ?? prev.printerLogoUrl,
    serialPath: patch.serialPath ?? prev.serialPath,
    serialBaud: patch.serialBaud ?? prev.serialBaud
  };
}

function readLegacyGlobalSerial(): { path: string; baud: number } | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const p = (window.localStorage.getItem(LEGACY_SERIAL_PATH) || '').trim();
    if (!p) {
      return null;
    }
    const b =
      Number(window.localStorage.getItem(LEGACY_SERIAL_BAUD) || '9600') || 9600;
    return { path: p, baud: b };
  } catch {
    return null;
  }
}

function clearLegacyGlobalSerial(): void {
  try {
    window.localStorage.removeItem(LEGACY_SERIAL_PATH);
    window.localStorage.removeItem(LEGACY_SERIAL_BAUD);
  } catch {
    // ignore
  }
}

/**
 * Pull serial from pre-namespaced `kioskSerialPath` / `kioskSerialBaud` into this unit once, then
 * clear globals.
 */
function withSerialMigrated(
  unitId: string,
  current: KioskTauriLocalDeviceV1
): KioskTauriLocalDeviceV1 {
  if (current.serialPath?.trim()) {
    return current;
  }
  const g = readLegacyGlobalSerial();
  if (!g) {
    return current;
  }
  return {
    ...current,
    v: 1,
    unitId: unitId.trim(),
    serialPath: g.path,
    serialBaud: g.baud
  };
}

/**
 * One-time migration: legacy print fields in API kiosk JSON → local; legacy global serial →
 * this unit. Persists when something changes.
 * Call on kiosk mount in Tauri (e.g. when `unit` loads).
 */
export function ensureKioskTauriLocalMigrated(
  unitId: string,
  serverKiosk: KioskConfig | undefined
): void {
  if (typeof window === 'undefined' || !unitId.trim()) {
    return;
  }
  const widened = serverKiosk as KioskConfigForDeviceRuntime;
  const existing = readKioskTauriLocalDevice(unitId);
  if (existing) {
    const withS = withSerialMigrated(unitId, existing);
    if (
      withS.serialPath !== existing.serialPath ||
      withS.serialBaud !== existing.serialBaud
    ) {
      writeKioskTauriLocalDevice(withS);
      clearLegacyGlobalSerial();
    }
    return;
  }
  const hasPrint = hasLegacyKioskPrintFields(widened);
  const g = readLegacyGlobalSerial();
  if (hasPrint) {
    const migrated = withSerialMigrated(
      unitId,
      migrateKioskTauriLocalFromServerKiosk(unitId, widened)
    );
    writeKioskTauriLocalDevice(migrated);
    if (g) {
      clearLegacyGlobalSerial();
    }
    return;
  }
  if (g) {
    const next: KioskTauriLocalDeviceV1 = {
      v: 1,
      unitId: unitId.trim(),
      serialPath: g.path,
      serialBaud: g.baud
    };
    writeKioskTauriLocalDevice(next);
    clearLegacyGlobalSerial();
  }
}

/**
 * @deprecated Prefer namespaced `readKioskTauriLocalDevice` + `serialPath` in shared record.
 * Used only where `unitId` is not in scope; removes globals after first read in sheet.
 */
export function ensureSerialMigratedForUnit(unitId: string): void {
  ensureKioskTauriLocalMigrated(unitId, undefined);
}
