import type { Invoice } from '@quokkaq/shared-types';
import { ApiHttpError, invoicesApi } from '@/lib/api';
import {
  fallbackInvoicePdfFilename,
  parseFilenameFromContentDisposition,
  triggerBlobDownload
} from '@/lib/download-blob';

export async function downloadInvoicePdf(inv: Invoice): Promise<void> {
  const { blob, contentDisposition } = await invoicesApi.downloadInvoice(
    inv.id
  );
  const fromHeader = parseFilenameFromContentDisposition(contentDisposition);
  const name = fromHeader ?? fallbackInvoicePdfFilename(inv);
  triggerBlobDownload(blob, name);
}

/** Prefer API JSON `message` (e.g. localized 422) over a generic i18n fallback. */
export function invoicePdfDownloadErrorToastMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof ApiHttpError ? error.message : fallback;
}
