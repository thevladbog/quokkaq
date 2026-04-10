/**
 * Mirrors backend internal/invoicing.ComputeLine (linecalc.go) for draft previews.
 */
export type InvoiceLineCalcInput = {
  unitPriceInclVatMinor: number;
  quantity: number;
  discountPercent: number | null;
  discountAmountMinor: number | null;
  vatExempt: boolean;
  vatRatePercent: number;
};

export type InvoiceLineTotals = {
  lineNetMinor: number;
  vatAmountMinor: number;
  lineGrossMinor: number;
};

export function computeLineTotals(
  in_: InvoiceLineCalcInput
): InvoiceLineTotals | null {
  const q = in_.quantity;
  if (!(q > 0) || !Number.isFinite(q)) return null;
  const unit = in_.unitPriceInclVatMinor;
  if (unit < 0 || !Number.isFinite(unit)) return null;
  if (in_.discountPercent != null && in_.discountAmountMinor != null) {
    return null;
  }
  if (in_.vatRatePercent < 0 || !Number.isFinite(in_.vatRatePercent)) {
    return null;
  }

  const lineGross = Math.round(unit * q);
  if (!Number.isFinite(lineGross) || lineGross < 0) return null;

  let discounted = lineGross;
  if (in_.discountPercent != null) {
    const p = in_.discountPercent;
    if (p < 0 || p > 100) return null;
    discounted = Math.round(lineGross * (1 - p / 100));
  }
  if (in_.discountAmountMinor != null) {
    const d = in_.discountAmountMinor;
    if (d < 0) return null;
    discounted = lineGross - d;
  }
  if (discounted < 0) discounted = 0;

  if (in_.vatExempt) {
    return {
      lineNetMinor: discounted,
      vatAmountMinor: 0,
      lineGrossMinor: discounted
    };
  }
  const vr = in_.vatRatePercent;
  if (vr === 0) {
    return {
      lineNetMinor: discounted,
      vatAmountMinor: 0,
      lineGrossMinor: discounted
    };
  }

  const net = Math.round(discounted / (1 + vr / 100));
  let vat = discounted - net;
  if (vat < 0) vat = 0;
  return { lineNetMinor: net, vatAmountMinor: vat, lineGrossMinor: discounted };
}

/** Gross before discount: rounded unit × qty (same as backend ComputeLine). */
export function lineGrossBeforeDiscountMinor(
  unitPriceInclVatMinor: number,
  quantity: number
): number {
  return Math.round(unitPriceInclVatMinor * quantity);
}

/** Discount in minor units for a draft/preview line (0 if none). */
export function discountMinorForLineInput(
  in_: InvoiceLineCalcInput
): number | null {
  const tot = computeLineTotals(in_);
  if (!tot) return null;
  const before = lineGrossBeforeDiscountMinor(
    in_.unitPriceInclVatMinor,
    in_.quantity
  );
  return Math.max(0, before - tot.lineGrossMinor);
}

/** Discount for a persisted line from stored gross vs pre-discount gross. */
export function discountMinorForPersistedLine(line: {
  unitPriceInclVatMinor: number;
  quantity: number;
  lineGrossMinor: number;
}): number {
  const before = lineGrossBeforeDiscountMinor(
    line.unitPriceInclVatMinor,
    line.quantity
  );
  return Math.max(0, before - line.lineGrossMinor);
}

/**
 * Unit price incl. VAT after all line discounts (matches line total / qty).
 */
export function effectiveUnitPriceInclVatMinor(line: {
  quantity: number;
  lineGrossMinor: number;
}): number {
  const q = line.quantity;
  if (!(q > 0) || !Number.isFinite(q)) return 0;
  return Math.round(line.lineGrossMinor / q);
}
