import type { Invoice } from '@quokkaq/shared-types';
import { formatPriceMinorUnits } from './format-price';

/** Thrown when {@link ruBankPaymentPurposeFromInvoice} cannot build copy without a real document number (bank / QR). */
export class MissingInvoiceDocumentNumberError extends Error {
  constructor() {
    super('missing document number');
    this.name = 'MissingInvoiceDocumentNumberError';
  }
}

/**
 * Russian payment purpose for printed invoice and ST00012 QR (RUB bank apps).
 * Fixed wording per product/legal copy; amount in rubles; VAT phrase from invoice totals.
 * @throws {MissingInvoiceDocumentNumberError} if `documentNumber` is absent or whitespace-only (do not substitute internal ids).
 */
export function ruBankPaymentPurposeFromInvoice(inv: Invoice): string {
  const doc = inv.documentNumber?.trim();
  if (!doc) {
    throw new MissingInvoiceDocumentNumberError();
  }
  const cur = inv.currency?.trim() || 'RUB';
  const amount = formatPriceMinorUnits(inv.amount, cur, 'ru-RU');
  const vatMinor =
    inv.vatTotalMinor ??
    inv.lines?.reduce((s, l) => s + (l.vatAmountMinor ?? 0), 0) ??
    0;
  const vatPhrase = vatMinor > 0 ? 'в т.ч. НДС' : 'без НДС';
  return `Оплата по счету № ${doc} за услуги предоставления доступа к сервису КвоккаКю на сумму ${amount}, ${vatPhrase}.`;
}
