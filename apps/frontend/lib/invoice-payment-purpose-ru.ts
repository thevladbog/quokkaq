import type { Invoice } from '@quokkaq/shared-types';
import { formatPriceMinorUnits } from './format-price';

/**
 * Russian payment purpose for printed invoice and ST00012 QR (RUB bank apps).
 * Fixed wording per product/legal copy; amount in rubles; VAT phrase from invoice totals.
 */
export function ruBankPaymentPurposeFromInvoice(inv: Invoice): string {
  const doc = inv.documentNumber?.trim() || `…${inv.id.slice(0, 8)}`;
  const cur = inv.currency?.trim() || 'RUB';
  const amount = formatPriceMinorUnits(inv.amount, cur, 'ru-RU');
  const vatMinor =
    inv.vatTotalMinor ??
    inv.lines?.reduce((s, l) => s + (l.vatAmountMinor ?? 0), 0) ??
    0;
  const vatPhrase = vatMinor > 0 ? 'в т.ч. НДС' : 'без НДС';
  return `Оплата по счету № ${doc} за услуги предоставления доступа к сервису КвоккаКю на сумму ${amount}, ${vatPhrase}.`;
}
