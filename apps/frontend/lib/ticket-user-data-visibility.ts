import { getServiceIdentificationMode } from '@/lib/kiosk-service-identification';
import type { Service, Ticket } from '@quokkaq/shared-types';

export function ticketHasDocumentsData(
  ticket: Pick<Ticket, 'documentsData'>
): boolean {
  const d = ticket.documentsData;
  return (
    d != null && typeof d === 'object' && Object.keys(d as object).length > 0
  );
}

function parseKioskIdentPreview(raw: unknown): {
  showInQueuePreview?: boolean;
} {
  if (raw && typeof raw === 'object' && 'showInQueuePreview' in raw) {
    return {
      showInQueuePreview: (raw as { showInQueuePreview?: boolean })
        .showInQueuePreview
    };
  }
  return {};
}

/**
 * When list APIs include `documentsData` (staff with tickets.user_data.read), decide if the
 * staff queue "info" affordance and tooltip should be shown for this ticket.
 * Document mode: always. Custom: only if service config has showInQueuePreview.
 * If the service is not in `getService` (missing unit cache), and data is present, the icon is shown.
 */
export function shouldShowUserDataInQueueList(
  ticket: Pick<Ticket, 'documentsData' | 'serviceId'>,
  getService: (id: string | undefined) => Service | undefined
): boolean {
  if (!ticketHasDocumentsData(ticket)) {
    return false;
  }
  const s = getService(ticket.serviceId);
  if (!s) {
    return true;
  }
  const mode = getServiceIdentificationMode(s);
  if (mode === 'document') {
    return true;
  }
  if (mode === 'custom') {
    return (
      parseKioskIdentPreview(s.kioskIdentificationConfig).showInQueuePreview ===
      true
    );
  }
  return false;
}

export function getDocumentsDataPreviewString(
  ticket: Pick<Ticket, 'documentsData'>,
  maxLen = 120
): string {
  const d = ticket.documentsData;
  if (!d || typeof d !== 'object') {
    return '';
  }
  const e = d as Record<string, unknown>;
  const keys = Object.keys(e);
  if (keys.length === 0) {
    return '';
  }
  const k = keys[0];
  const v = e[k];
  const text =
    v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);
  const line = `${k}: ${text}`;
  if (line.length <= maxLen) {
    return line;
  }
  return `${line.slice(0, maxLen - 1)}…`;
}
