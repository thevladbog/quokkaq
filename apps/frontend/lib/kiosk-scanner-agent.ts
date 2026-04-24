/**
 * Local QuokkaQ print/scanner agent (Tauri) — see apps/kiosk-desktop/agent.
 * Default: http://127.0.0.1:17431
 */
import { isTauriKiosk } from '@/lib/kiosk-print';

const DEFAULT_AGENT = 'http://127.0.0.1:17431';

export function kioskAgentBase(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_AGENT;
  }
  const c = (window as { __KIOSK_AGENT__?: string }).__KIOSK_AGENT__;
  return c?.replace(/\/$/, '') || DEFAULT_AGENT;
}

export type SerialPortItem = { path: string; label?: string };

export async function listKioskSerialPorts(): Promise<{
  ports: SerialPortItem[];
  error?: string;
}> {
  if (!isTauriKiosk()) {
    return { ports: [] };
  }
  const r = await fetch(`${kioskAgentBase()}/v1/serial-ports`, {
    method: 'GET',
    mode: 'cors'
  });
  if (!r.ok) {
    return { ports: [], error: await r.text() };
  }
  return (await r.json()) as { ports: SerialPortItem[]; error?: string };
}

export async function testKioskSerialPort(body: {
  port: string;
  baud: number;
  challenge?: string;
  timeoutSec?: number;
}): Promise<{
  ok: boolean;
  challenge?: string;
  read?: string;
  message?: string;
}> {
  if (!isTauriKiosk()) {
    return { ok: false, message: 'Not in desktop' };
  }
  const r = await fetch(`${kioskAgentBase()}/v1/serial/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      port: body.port,
      baud: body.baud,
      challenge: body.challenge,
      timeoutSec: body.timeoutSec ?? 30
    }),
    mode: 'cors'
  });
  return (await r.json()) as {
    ok: boolean;
    challenge?: string;
    read?: string;
    message?: string;
  };
}

export function serialScannerStreamUrl(path: string, baud: number): string {
  return `${kioskAgentBase()}/v1/serial/stream?${new URLSearchParams({ path, baud: String(baud) })}`;
}
