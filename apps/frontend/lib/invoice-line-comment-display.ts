/** Strip one outer pair of parentheses (matches backend normalization). */
export function normalizeInvoiceLineCommentForSave(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Wrap stored comment in parentheses for UI/PDF-style display. */
export function invoiceLineCommentForDisplay(
  stored: string | undefined | null
): string {
  const inner = normalizeInvoiceLineCommentForSave(stored ?? '');
  if (!inner) return '';
  return `(${inner})`;
}
