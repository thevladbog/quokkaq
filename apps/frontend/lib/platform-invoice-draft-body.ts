import type {
  Invoice,
  InvoiceDraftCreateBody,
  InvoiceDraftLineInput,
  InvoiceDraftUpsertBody,
  InvoiceLine
} from '@quokkaq/shared-types';
import { toDateTimeLocalString } from './format-datetime';
import {
  minorUnitsToAmountInputString,
  parseAmountStringToMinorUnits,
  validateVatRatePercentInput
} from './format-price';
import type { InvoiceLineCalcInput } from './invoice-line-totals';
import { normalizeInvoiceLineCommentForSave } from './invoice-line-comment-display';

const maxInvoiceLineCommentRunes = 512;

export type DraftLineRow = {
  key: string;
  catalogItemId: string;
  descriptionPrint: string;
  lineComment: string;
  quantity: string;
  measureUnit: string;
  unitPriceInput: string;
  vatExempt: boolean;
  vatRatePercent: string;
  discountPercent: string;
  discountAmountInput: string;
  isLicenseLine: boolean;
  subscriptionPlanId: string;
  subscriptionPeriodStart: string;
};

export function newDraftLineRow(key?: string): DraftLineRow {
  return {
    key:
      key ??
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Math.random())),
    catalogItemId: '',
    descriptionPrint: '',
    lineComment: '',
    quantity: '1',
    measureUnit: '',
    unitPriceInput: '',
    vatExempt: false,
    vatRatePercent: '20',
    discountPercent: '',
    discountAmountInput: '',
    isLicenseLine: false,
    subscriptionPlanId: '',
    subscriptionPeriodStart: ''
  };
}

export function rowsFromInvoiceLines(
  lines: InvoiceLine[] | undefined,
  invoiceCurrency: string,
  appLocale: string
): DraftLineRow[] {
  const cur = invoiceCurrency.trim() || 'RUB';
  if (!lines?.length) return [newDraftLineRow()];
  return [...lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      key: l.id || newDraftLineRow().key,
      catalogItemId: (l.catalogItemId ?? '').trim(),
      descriptionPrint: l.descriptionPrint,
      lineComment: (l.lineComment ?? '').trim(),
      quantity: String(l.quantity),
      measureUnit: (l.unit ?? '').trim(),
      unitPriceInput: minorUnitsToAmountInputString(
        l.unitPriceInclVatMinor,
        cur,
        appLocale
      ),
      vatExempt: l.vatExempt,
      vatRatePercent:
        typeof l.vatRatePercent === 'number' &&
        Number.isFinite(l.vatRatePercent)
          ? String(l.vatRatePercent)
          : '20',
      discountPercent:
        l.discountPercent != null ? String(l.discountPercent) : '',
      discountAmountInput:
        l.discountAmountMinor != null
          ? minorUnitsToAmountInputString(l.discountAmountMinor, cur, appLocale)
          : '',
      isLicenseLine: !!(l.subscriptionPlanId && l.subscriptionPlanId.trim()),
      subscriptionPlanId: (l.subscriptionPlanId ?? '').trim(),
      subscriptionPeriodStart: l.subscriptionPeriodStart
        ? toDateTimeLocalString(l.subscriptionPeriodStart)
        : ''
    }));
}

export function buildDraftBody(
  companyId: string,
  dueLocal: string,
  currency: string,
  allowYookassa: boolean,
  allowStripe: boolean,
  provision: boolean,
  paymentTerms: string,
  rows: DraftLineRow[],
  intlLocale: string
): InvoiceDraftCreateBody {
  const dueTrimmed = dueLocal.trim();
  if (dueTrimmed === '') {
    throw new Error('dueEmpty');
  }
  const due = new Date(dueTrimmed);
  if (Number.isNaN(due.getTime())) {
    throw new Error('dueInvalid');
  }

  const cur = currency.trim() || 'RUB';
  let licenseRows = 0;
  const lines = rows.map((r) => {
    const qty = Number.parseFloat(r.quantity.trim());
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('quantityInvalid');
    }
    const unit = parseAmountStringToMinorUnits(
      r.unitPriceInput,
      cur,
      intlLocale
    );
    if (!Number.isFinite(unit) || unit < 0) {
      throw new Error('unitPriceInvalid');
    }
    const desc = r.descriptionPrint.trim();
    if (!desc && !r.catalogItemId.trim()) {
      throw new Error('descriptionRequired');
    }

    const rawComment = r.lineComment.trim();
    if ([...rawComment].length > maxInvoiceLineCommentRunes) {
      throw new Error('lineCommentTooLong');
    }
    const lineComment = normalizeInvoiceLineCommentForSave(rawComment);

    let vatRatePercent = 0;
    if (!r.vatExempt) {
      const v = validateVatRatePercentInput(r.vatRatePercent);
      if (v === null) {
        throw new Error('vatRateInvalid');
      }
      vatRatePercent = v;
    }
    const line: InvoiceDraftUpsertBody['lines'][number] = {
      descriptionPrint: desc,
      quantity: qty,
      unit: r.measureUnit.trim(),
      unitPriceInclVatMinor: unit,
      vatExempt: r.vatExempt,
      vatRatePercent,
      lineComment
    };

    const cat = r.catalogItemId.trim();
    if (cat) line.catalogItemId = cat;

    const dp = r.discountPercent.trim();
    const da = r.discountAmountInput.trim();
    if (dp && da) {
      throw new Error('discountBoth');
    }
    if (dp) {
      const p = Number.parseFloat(dp.replace(',', '.'));
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        throw new Error('discountPercentInvalid');
      }
      line.discountPercent = p;
    } else if (da) {
      const m = parseAmountStringToMinorUnits(da, cur, intlLocale);
      if (!Number.isFinite(m) || m < 0) {
        throw new Error('discountAmountInvalid');
      }
      line.discountAmountMinor = m;
    }

    if (r.isLicenseLine) {
      const planId = r.subscriptionPlanId.trim();
      if (!planId) {
        throw new Error('planRequired');
      }
      const st = new Date(r.subscriptionPeriodStart.trim());
      if (Number.isNaN(st.getTime())) {
        throw new Error('periodStartInvalid');
      }
      line.subscriptionPlanId = planId;
      line.subscriptionPeriodStart = st.toISOString();
      if (provision) {
        licenseRows++;
        if (licenseRows > 1) {
          throw new Error('tooManyLicenseLines');
        }
      }
    }

    return line;
  });

  return {
    companyId: companyId.trim(),
    dueDate: due.toISOString(),
    currency: cur,
    allowYookassaPaymentLink: allowYookassa,
    allowStripePaymentLink: allowStripe,
    provisionSubscriptionsOnPayment: provision,
    paymentTerms,
    lines
  };
}

/** Rebuild PATCH draft body from a server invoice (for rollback after a failed issue). */
export function invoiceToDraftUpsertBody(inv: Invoice): InvoiceDraftUpsertBody {
  const companyId = inv.companyId?.trim() ?? '';
  const lines: InvoiceDraftLineInput[] = [...(inv.lines ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((l) => {
      const line: InvoiceDraftLineInput = {
        descriptionPrint: l.descriptionPrint,
        lineComment: normalizeInvoiceLineCommentForSave(
          (l.lineComment ?? '').trim()
        ),
        quantity: l.quantity,
        unit: l.unit ?? '',
        unitPriceInclVatMinor: l.unitPriceInclVatMinor,
        vatExempt: l.vatExempt,
        vatRatePercent: l.vatRatePercent
      };
      const cat = (l.catalogItemId ?? '').trim();
      if (cat) line.catalogItemId = cat;
      if (l.discountPercent != null) line.discountPercent = l.discountPercent;
      if (l.discountAmountMinor != null)
        line.discountAmountMinor = l.discountAmountMinor;
      const plan = (l.subscriptionPlanId ?? '').trim();
      if (plan) {
        line.subscriptionPlanId = plan;
        if (l.subscriptionPeriodStart) {
          line.subscriptionPeriodStart = l.subscriptionPeriodStart;
        }
      }
      return line;
    });

  return {
    companyId,
    dueDate: inv.dueDate,
    currency: (inv.currency ?? 'RUB').trim() || 'RUB',
    allowYookassaPaymentLink: inv.allowYookassaPaymentLink ?? false,
    allowStripePaymentLink: inv.allowStripePaymentLink ?? false,
    provisionSubscriptionsOnPayment:
      inv.provisionSubscriptionsOnPayment ?? false,
    paymentTerms: inv.paymentTerms ?? '',
    lines
  };
}

/** Draft preview: same numeric rules as save, but omits description / license checks. */
export function tryParseDraftRowForTotals(
  r: DraftLineRow,
  currency: string,
  intlLocale: string
): InvoiceLineCalcInput | null {
  const cur = currency.trim() || 'RUB';
  const qty = Number.parseFloat(r.quantity.trim());
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = parseAmountStringToMinorUnits(r.unitPriceInput, cur, intlLocale);
  if (!Number.isFinite(unit) || unit < 0) return null;

  const dp = r.discountPercent.trim();
  const da = r.discountAmountInput.trim();
  if (dp && da) return null;

  let discountPercent: number | null = null;
  let discountAmountMinor: number | null = null;
  if (dp) {
    const p = Number.parseFloat(dp.replace(',', '.'));
    if (!Number.isFinite(p) || p < 0 || p > 100) return null;
    discountPercent = p;
  } else if (da) {
    const m = parseAmountStringToMinorUnits(da, cur, intlLocale);
    if (!Number.isFinite(m) || m < 0) return null;
    discountAmountMinor = m;
  }

  const vatExempt = r.vatExempt;
  const vatRatePercent = vatExempt
    ? 0
    : validateVatRatePercentInput(r.vatRatePercent);
  if (!vatExempt && vatRatePercent === null) return null;

  return {
    unitPriceInclVatMinor: unit,
    quantity: qty,
    discountPercent,
    discountAmountMinor,
    vatExempt,
    vatRatePercent: vatRatePercent ?? 0
  };
}
