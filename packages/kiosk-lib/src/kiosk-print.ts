import { invoke } from '@tauri-apps/api/core';
import type { Ticket } from '@quokkaq/shared-types';

const ESC = 0x1b;
const GS = 0x1d;

export type PrinterInfo = {
  name: string;
  isDefault: boolean;
};

/** True when running inside a Tauri webview (local or remote allowlisted URL). */
export function isTauriKiosk(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__);
}

/** Build simple ESC/POS bytes for a thermal receipt (UTF-8). */
export function buildEscPosReceipt(lines: string[]): Uint8Array {
  const parts: number[] = [];
  parts.push(ESC, 0x40); // init
  for (const line of lines) {
    for (const b of new TextEncoder().encode(`${line}\n`)) {
      parts.push(b);
    }
  }
  parts.push(GS, 0x56, 0x00); // partial cut
  return new Uint8Array(parts);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export type KioskPrintTarget = {
  host: string;
  port: string;
};

/** Printers from the local agent (desktop only). */
export async function listPrintersViaTauri(): Promise<{
  printers: PrinterInfo[];
  error?: string;
}> {
  if (!isTauriKiosk()) {
    return { printers: [] };
  }
  const raw = await invoke<string>('list_printers');
  const data = JSON.parse(raw) as {
    printers?: PrinterInfo[];
    error?: string;
  };
  return {
    printers: data.printers ?? [],
    error: data.error
  };
}

type KioskPrinterConfig = {
  printerConnection?: 'network' | 'system';
  systemPrinterName?: string;
  printerIp?: string;
  printerPort?: string;
  printerType?: string;
  isPrintEnabled?: boolean;
};

function resolvePrintTarget(kiosk: KioskPrinterConfig): {
  mode: 'tcp' | 'system';
  target: string;
} | null {
  if (kiosk.isPrintEnabled === false || kiosk.printerType === 'label') {
    return null;
  }
  const connection =
    kiosk.printerConnection ??
    (kiosk.systemPrinterName?.trim() ? 'system' : 'network');

  if (connection === 'system') {
    const name = kiosk.systemPrinterName?.trim();
    if (!name) {
      return null;
    }
    return { mode: 'system', target: name };
  }

  const host = kiosk.printerIp?.trim();
  if (!host) {
    return null;
  }
  const port = (kiosk.printerPort || '9100').trim();
  return { mode: 'tcp', target: `${host}:${port}` };
}

/**
 * Send raw ESC/POS bytes via Tauri → agent (`tcp` or `system` queue).
 * Returns false if not in Tauri or missing target.
 */
export async function printKioskJobBytes(
  mode: 'tcp' | 'system',
  target: string,
  bytes: Uint8Array
): Promise<boolean> {
  if (!isTauriKiosk()) {
    return false;
  }
  const t = target.trim();
  if (!t) {
    return false;
  }
  const payload = bytesToBase64(bytes);
  await invoke('print_receipt', {
    mode,
    target: t,
    payloadBase64: payload
  });
  return true;
}

/**
 * Send ESC/POS via Tauri → agent (`tcp` to host:port or `system` queue).
 * Returns false if not in Tauri or missing target.
 */
export async function printKioskJob(
  mode: 'tcp' | 'system',
  target: string,
  lines: string[]
): Promise<boolean> {
  return printKioskJobBytes(mode, target, buildEscPosReceipt(lines));
}

/**
 * Print raw bytes using unit kiosk config (network or system queue).
 * Returns false if not applicable or not in Tauri.
 */
export async function printReceiptBytesFromKioskConfig(
  kiosk: KioskPrinterConfig,
  bytes: Uint8Array
): Promise<boolean> {
  const resolved = resolvePrintTarget(kiosk);
  if (!resolved) {
    return false;
  }
  return printKioskJobBytes(resolved.mode, resolved.target, bytes);
}

/**
 * Print using unit kiosk config (network or system queue).
 * Returns false if not applicable or not in Tauri.
 */
export async function printReceiptFromKioskConfig(
  kiosk: KioskPrinterConfig,
  lines: string[]
): Promise<boolean> {
  return printReceiptBytesFromKioskConfig(kiosk, buildEscPosReceipt(lines));
}

/** @deprecated Use printReceiptFromKioskConfig or printKioskJob */
export async function printReceiptViaTauri(
  target: KioskPrintTarget,
  lines: string[]
): Promise<boolean> {
  const host = target.host.trim();
  if (!host) {
    return false;
  }
  return printKioskJob('tcp', `${host}:${target.port.trim() || '9100'}`, lines);
}

/** Lines for a ticket after creation / pre-reg redemption. */
export function ticketReceiptLines(
  ticket: Ticket,
  serviceLabel: string,
  unitName?: string
): string[] {
  const lines: string[] = [];
  if (unitName) {
    lines.push(unitName);
    lines.push('');
  }
  lines.push(serviceLabel);
  lines.push(`#${ticket.queueNumber}`);
  lines.push('');
  lines.push(ticket.id);
  return lines;
}

/** Short test pattern for printer settings. */
export function testPrintLines(): string[] {
  return ['QuokkaQ', 'Test print', '', new Date().toISOString()];
}

/**
 * Desktop only: delete `desktop-profile.json` / legacy URL file and open the pairing splash.
 * No-op when not running inside Tauri.
 */
export async function resetDesktopPairingViaTauri(): Promise<boolean> {
  if (!isTauriKiosk()) {
    return false;
  }
  await invoke('reset_desktop_pairing');
  return true;
}
