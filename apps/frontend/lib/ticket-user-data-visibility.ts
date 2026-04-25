import { getServiceIdentificationMode } from '@/lib/kiosk-service-identification';
import {
  KIOSK_ID_CUSTOM_DATA_SKIPPED_KEY,
  KIOSK_ID_DOCUMENT_OCR_FAILED_KEY,
  type Service,
  type Ticket
} from '@quokkaq/shared-types';

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
 * If the service cannot be resolved, do not show previews (fail closed).
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
    return false;
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

/** Human labels for staff-facing previews/tooltips (not for public visitor UIs). */
export type DocumentsDataFlagLabels = {
  ocrFailed: string;
  customSkipped: string;
};

/**
 * One-line summary for staff queue/hero. Without `flagLabels`, keeps legacy behavior
 * (first key only). With `flagLabels`, expands known kiosk flags to full phrases and
 * can combine multiple entries.
 */
export function getDocumentsDataPreviewString(
  ticket: Pick<Ticket, 'documentsData'>,
  maxLen = 120,
  flagLabels?: DocumentsDataFlagLabels
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

  if (!flagLabels) {
    const k = keys[0]!;
    const v = e[k];
    const text =
      v === null || v === undefined
        ? ''
        : typeof v === 'string'
          ? v
          : String(v);
    const line = `${k}: ${text}`;
    if (line.length <= maxLen) {
      return line;
    }
    return `${line.slice(0, maxLen - 1)}…`;
  }

  const parts: string[] = [];
  for (const k of keys) {
    const v = e[k];
    if (k === KIOSK_ID_DOCUMENT_OCR_FAILED_KEY && v === true) {
      parts.push(flagLabels.ocrFailed);
    } else if (k === KIOSK_ID_CUSTOM_DATA_SKIPPED_KEY && v === true) {
      parts.push(flagLabels.customSkipped);
    } else {
      const text =
        v === null || v === undefined
          ? ''
          : typeof v === 'string'
            ? v
            : String(v);
      parts.push(`${k}: ${text}`);
    }
  }
  const line = parts.filter(Boolean).join(' · ');
  if (line.length <= maxLen) {
    return line;
  }
  return `${line.slice(0, maxLen - 1)}…`;
}
