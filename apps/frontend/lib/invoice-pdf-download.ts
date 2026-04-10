import type { Invoice } from '@quokkaq/shared-types';
import { invoicesApi } from '@/lib/api';
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
