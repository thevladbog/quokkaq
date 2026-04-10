import type { InvoiceLine } from '@quokkaq/shared-types';

export type InvoiceVatSummaryRow =
  | { kind: 'exempt'; key: 'exempt' }
  | { kind: 'rate'; key: string; rate: number; vatMinor: number };

export function invoiceVatSummaryFromLines(
  lines: InvoiceLine[]
): InvoiceVatSummaryRow[] {
  const vatByRateNonExempt = new Map<number, number>();
  let anyExemptLine = false;
  for (const line of lines) {
    if (line.vatExempt) {
      anyExemptLine = true;
    } else {
      const rate = line.vatRatePercent;
      vatByRateNonExempt.set(
        rate,
        (vatByRateNonExempt.get(rate) ?? 0) + line.vatAmountMinor
      );
    }
  }
  const rateKeysSorted = [...vatByRateNonExempt.keys()].sort((a, b) => a - b);
  const rows: InvoiceVatSummaryRow[] = [];
  if (anyExemptLine) rows.push({ kind: 'exempt', key: 'exempt' });
  for (const rate of rateKeysSorted) {
    rows.push({
      kind: 'rate',
      key: `r-${rate}`,
      rate,
      vatMinor: vatByRateNonExempt.get(rate) ?? 0
    });
  }
  return rows;
}
