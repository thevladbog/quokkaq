import type { Invoice } from '@quokkaq/shared-types';
import { describe, expect, it } from 'vitest';
import { formatPriceMinorUnits } from './format-price';
import {
  MissingInvoiceDocumentNumberError,
  ruBankPaymentPurposeFromInvoice
} from './invoice-payment-purpose-ru';

function inv(
  partial: Partial<Invoice> &
    Pick<Invoice, 'id' | 'amount' | 'currency' | 'status' | 'dueDate'>
): Invoice {
  return partial as Invoice;
}

describe('ruBankPaymentPurposeFromInvoice', () => {
  it('includes document number, amount, and VAT phrase', () => {
    const invoice = inv({
      id: 'x',
      amount: 10000_00,
      currency: 'RUB',
      status: 'open',
      dueDate: '2026-01-01',
      documentNumber: 'QQ-1',
      vatTotalMinor: 500_00,
      subtotalExclVatMinor: 9500_00
    });
    const s = ruBankPaymentPurposeFromInvoice(invoice);
    const expectedAmount = formatPriceMinorUnits(
      invoice.amount,
      invoice.currency,
      'ru-RU'
    );
    expect(s).toContain('QQ-1');
    expect(s).toContain(expectedAmount);
    expect(s).toContain('КвоккаКю');
    expect(s).toContain('в т.ч. НДС');
  });

  it('throws when document number is missing', () => {
    expect(() =>
      ruBankPaymentPurposeFromInvoice(
        inv({
          id: 'x',
          amount: 5000_00,
          currency: 'RUB',
          status: 'open',
          dueDate: '2026-01-01',
          documentNumber: null,
          vatTotalMinor: 0,
          subtotalExclVatMinor: 5000_00
        })
      )
    ).toThrow(MissingInvoiceDocumentNumberError);
  });

  it('uses без НДС when vat total is zero and document number is set', () => {
    const s = ruBankPaymentPurposeFromInvoice(
      inv({
        id: 'x',
        amount: 5000_00,
        currency: 'RUB',
        status: 'open',
        dueDate: '2026-01-01',
        documentNumber: 'QQ-2',
        vatTotalMinor: 0,
        subtotalExclVatMinor: 5000_00
      })
    );
    expect(s).toContain('QQ-2');
    expect(s).toContain('без НДС');
  });
});
