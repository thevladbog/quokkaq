/**
 * Parse filename from Content-Disposition (RFC 5987 filename* preferred).
 */
export function parseFilenameFromContentDisposition(
  header: string | null | undefined
): string | null {
  if (!header?.trim()) return null;
  const h = header.trim();

  const starIdx = h.toLowerCase().indexOf('filename*=');
  if (starIdx !== -1) {
    let rest = h.slice(starIdx + 'filename*='.length).trim();
    if (rest.toUpperCase().startsWith("UTF-8''")) {
      rest = rest.slice(7);
    }
    const semi = rest.indexOf(';');
    const encoded = (semi === -1 ? rest : rest.slice(0, semi)).trim();
    try {
      const decoded = decodeURIComponent(encoded.replace(/\+/g, '%20'));
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }

  const fnMatch = h.match(/filename\s*=\s*"((?:[^"\\]|\\.)*)"/i);
  if (fnMatch?.[1]) {
    return fnMatch[1].replace(/\\(.)/g, '$1');
  }
  const fnUnquoted = h.match(/filename\s*=\s*([^;\s]+)/i);
  if (fnUnquoted?.[1]) {
    return fnUnquoted[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

function randomHex8(): string {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Matches backend filename when Content-Disposition is missing (random suffix per call). */
export function fallbackInvoicePdfFilename(inv: {
  id: string;
  documentNumber?: string | null;
  issuedAt?: string | null;
  createdAt?: string;
}): string {
  const docRaw = inv.documentNumber?.trim() || inv.id.slice(0, 8);
  const doc = docRaw.replace(/[/\\:*?"<>|]/g, '_');
  const dateSrc = inv.issuedAt || inv.createdAt;
  const d = dateSrc ? new Date(dateSrc) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${day}`;
  const hash8 = randomHex8();
  return `Счет_на_оплату_${doc}_От_${dateStr}_${hash8}.pdf`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
