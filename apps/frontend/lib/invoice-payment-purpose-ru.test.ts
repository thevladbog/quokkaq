import type { Invoice } from '@quokkaq/shared-types';
import { describe, expect, it } from 'vitest';
import { ruBankPaymentPurposeFromInvoice } from './invoice-payment-purpose-ru';

function inv(
  partial: Partial<Invoice> &
    Pick<Invoice, 'id' | 'amount' | 'currency' | 'status' | 'dueDate'>
): Invoice {
  return partial as Invoice;
}

describe('ruBankPaymentPurposeFromInvoice', () => {
  it('includes document number, amount, and VAT phrase', () => {
    const s = ruBankPaymentPurposeFromInvoice(
      inv({
        id: 'x',
        amount: 10000_00,
        currency: 'RUB',
        status: 'open',
        dueDate: '2026-01-01',
        documentNumber: 'QQ-1',
        vatTotalMinor: 500_00,
        subtotalExclVatMinor: 9500_00
      })
    );
    expect(s).toContain('QQ-1');
    expect(s).toContain('КвоккаКю');
    expect(s).toContain('в т.ч. НДС');
  });

  it('uses без НДС when vat total is zero', () => {
    const s = ruBankPaymentPurposeFromInvoice(
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
    );
    expect(s).toContain('без НДС');
  });
});
