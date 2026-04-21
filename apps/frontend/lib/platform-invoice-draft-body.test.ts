import { describe, expect, it } from 'vitest';

import {
  buildDraftBody,
  invoiceToDraftUpsertBody,
  newDraftLineRow,
  tryParseDraftRowForTotals,
  type DraftLineRow
} from './platform-invoice-draft-body';

const enUS = 'en-US';

function line(over: Partial<DraftLineRow> = {}): DraftLineRow {
  return {
    ...newDraftLineRow('test-key'),
    descriptionPrint: 'Service',
    quantity: '2',
    measureUnit: 'шт',
    unitPriceInput: '100',
    vatExempt: true,
    vatRatePercent: '0',
    discountPercent: '',
    discountAmountInput: '',
    isLicenseLine: false,
    subscriptionPlanId: '',
    subscriptionPeriodStart: '',
    ...over
  };
}

describe('buildDraftBody', () => {
  it('builds body with one VAT-exempt line', () => {
    const body = buildDraftBody(
      'company-1',
      '2026-01-15T12:00:00.000Z',
      'RUB',
      false,
      false,
      false,
      '',
      [line({ catalogItemId: '', descriptionPrint: 'X' })],
      enUS
    );

    expect(body.companyId).toBe('company-1');
    expect(body.currency).toBe('RUB');
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.quantity).toBe(2);
    expect(body.lines[0]?.unitPriceInclVatMinor).toBe(10_000);
    expect(body.lines[0]?.vatExempt).toBe(true);
    expect(body.paymentTerms).toBe('');
  });

  it('includes paymentTerms in draft body', () => {
    const body = buildDraftBody(
      'company-1',
      '2026-01-15T12:00:00.000Z',
      'RUB',
      false,
      false,
      false,
      'Pay **within** 10 days',
      [line({ catalogItemId: '', descriptionPrint: 'X' })],
      enUS
    );
    expect(body.paymentTerms).toBe('Pay **within** 10 days');
  });

  it('allows description from catalog id only', () => {
    const body = buildDraftBody(
      'c',
      '2026-01-15T12:00:00.000Z',
      'RUB',
      false,
      false,
      false,
      '',
      [
        line({
          descriptionPrint: '   ',
          catalogItemId: 'cat-1',
          unitPriceInput: '1'
        })
      ],
      enUS
    );
    expect(body.lines[0]?.catalogItemId).toBe('cat-1');
  });

  it('throws dueInvalid for bad due date', () => {
    expect(() =>
      buildDraftBody(
        'c',
        'not-a-date',
        'RUB',
        false,
        false,
        false,
        '',
        [line()],
        enUS
      )
    ).toThrowError('dueInvalid');
  });

  it('throws dueEmpty when due is blank', () => {
    expect(() =>
      buildDraftBody('c', '', 'RUB', false, false, false, '', [line()], enUS)
    ).toThrowError('dueEmpty');
    expect(() =>
      buildDraftBody('c', '   ', 'RUB', false, false, false, '', [line()], enUS)
    ).toThrowError('dueEmpty');
  });

  it('throws quantityInvalid', () => {
    expect(() =>
      buildDraftBody(
        'c',
        '2026-01-15T12:00:00.000Z',
        'RUB',
        false,
        false,
        false,
        '',
        [line({ quantity: '0' })],
        enUS
      )
    ).toThrowError('quantityInvalid');
  });

  it('throws unitPriceInvalid', () => {
    expect(() =>
      buildDraftBody(
        'c',
        '2026-01-15T12:00:00.000Z',
        'RUB',
        false,
        false,
        false,
        '',
        [line({ unitPriceInput: 'xx' })],
        enUS
      )
    ).toThrowError('unitPriceInvalid');
  });

  it('throws descriptionRequired', () => {
    expect(() =>
      buildDraftBody(
        'c',
        '2026-01-15T12:00:00.000Z',
        'RUB',
        false,
        false,
        false,
        '',
        [line({ descriptionPrint: '', catalogItemId: '' })],
        enUS
      )
    ).toThrowError('descriptionRequired');
  });

  it('throws discountBoth', () => {
    expect(() =>
      buildDraftBody(
        'c',
        '2026-01-15T12:00:00.000Z',
        'RUB',
        false,
        false,
        false,
        '',
        [
          line({
            discountPercent: '5',
            discountAmountInput: '10'
          })
        ],
        enUS
      )
    ).toThrowError('discountBoth');
  });

  it('throws planRequired for license line without plan', () => {
    expect(() =>
      buildDraftBody(
        'c',
        '2026-01-15T12:00:00.000Z',
        'RUB',
        false,
        false,
        false,
        '',
        [line({ isLicenseLine: true, subscriptionPlanId: '' })],
        enUS
      )
    ).toThrowError('planRequired');
  });

  it('throws tooManyLicenseLines when provision and two license rows', () => {
    const lic = (id: string) =>
      line({
        key: id,
        isLicenseLine: true,
        subscriptionPlanId: 'plan-1',
        subscriptionPeriodStart: '2026-01-10T10:00:00.000Z'
      });
    expect(() =>
      buildDraftBody(
        'c',
        '2026-01-15T12:00:00.000Z',
        'RUB',
        false,
        false,
        true,
        '',
        [lic('a'), lic('b')],
        enUS
      )
    ).toThrowError('tooManyLicenseLines');
  });
});

describe('invoiceToDraftUpsertBody', () => {
  it('maps invoice fields and sorted lines', () => {
    const body = invoiceToDraftUpsertBody({
      companyId: 'co-1',
      dueDate: '2026-02-01T00:00:00.000Z',
      currency: 'RUB',
      allowYookassaPaymentLink: true,
      allowStripePaymentLink: false,
      provisionSubscriptionsOnPayment: true,
      lines: [
        {
          position: 2,
          descriptionPrint: 'B',
          quantity: 1,
          unit: 'u',
          unitPriceInclVatMinor: 100,
          vatExempt: false,
          vatRatePercent: 20
        },
        {
          position: 1,
          descriptionPrint: 'A',
          quantity: 1,
          unit: 'u',
          unitPriceInclVatMinor: 50,
          vatExempt: true,
          vatRatePercent: 0
        }
      ]
    } as import('@quokkaq/shared-types').Invoice);

    expect(body.lines[0]?.descriptionPrint).toBe('A');
    expect(body.lines[1]?.descriptionPrint).toBe('B');
    expect(body.companyId).toBe('co-1');
    expect(body.paymentTerms).toBe('');
  });

  it('maps paymentTerms from invoice', () => {
    const body = invoiceToDraftUpsertBody({
      companyId: 'co-1',
      dueDate: '2026-02-01T00:00:00.000Z',
      currency: 'RUB',
      paymentTerms: 'Net 30',
      lines: [
        {
          id: 'ln-1',
          invoiceId: 'inv-1',
          position: 1,
          descriptionPrint: 'A',
          quantity: 1,
          unit: '',
          unitPriceInclVatMinor: 100,
          vatExempt: false,
          vatRatePercent: 20,
          lineNetMinor: 0,
          vatAmountMinor: 0,
          lineGrossMinor: 100
        }
      ]
    } as import('@quokkaq/shared-types').Invoice);
    expect(body.paymentTerms).toBe('Net 30');
  });
});

describe('tryParseDraftRowForTotals', () => {
  it('returns null when quantity invalid', () => {
    expect(
      tryParseDraftRowForTotals(line({ quantity: '-1' }), 'RUB', enUS)
    ).toBeNull();
  });

  it('parses valid row', () => {
    const parsed = tryParseDraftRowForTotals(line(), 'RUB', enUS);
    expect(parsed).not.toBeNull();
    expect(parsed?.quantity).toBe(2);
    expect(parsed?.unitPriceInclVatMinor).toBe(10_000);
  });
});
