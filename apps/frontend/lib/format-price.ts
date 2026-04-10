/**
 * Subscription/billing amounts from the API are in minor units (e.g. kopeks for RUB).
 * Uses Intl currency fraction digits to pick divisor (100 for RUB/USD, 0 for JPY, etc.).
 */
export function minorUnitDivisor(currency: string, intlLocale: string): number {
  try {
    const digits =
      new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency
      }).resolvedOptions().maximumFractionDigits ?? 2;
    return 10 ** Math.min(Math.max(digits, 0), 8);
  } catch {
    return 100;
  }
}

/**
 * Accepts only a non-negative decimal literal: integer, digits.digits, digits., or .digits.
 * Rejects scientific notation, signs, and trailing junk (e.g. "123abc").
 */
function strictParseNonNegativeMajor(s: string): number | null {
  if (s === '' || s === '.' || s === '-') return null;
  if (/e/i.test(s)) return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function formatPriceMinorUnits(
  amountMinor: number,
  currency: string,
  intlLocale: string
): string {
  const divisor = minorUnitDivisor(currency, intlLocale);
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency
    }).format(amountMinor / divisor);
  } catch {
    return `${(amountMinor / divisor).toFixed(2)} ${currency}`;
  }
}

/**
 * Normalizes operator input: spaces removed; comma or dot as decimal separator
 * (e.g. "1 234,56" or "1234.50"). Returns a string safe for Number.parseFloat, or null.
 */
export function normalizeAmountInputToDecimalString(
  raw: string
): string | null {
  let s = raw.trim().replace(/\s+/g, '');
  if (s === '') return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length !== 2) return null;
    const after = parts[1];
    const nAfter = after.length;
    // Heuristic: exactly three digits after comma → thousands separator ("1,234" → 1234);
    // one or two digits → decimal comma ("12,34", "5,5").
    if (nAfter === 0 || nAfter > 3) return null;
    if (nAfter === 3) {
      s = `${parts[0]}${after}`;
    } else {
      s = `${parts[0]}.${after}`;
    }
  }
  if (strictParseNonNegativeMajor(s) === null) return null;
  return s;
}

/**
 * Validates VAT % in [0, 100] (inclusive).
 * Returns null for blank, non-numeric, or out-of-range input.
 */
export function validateVatRatePercentInput(raw: string): number | null {
  const s = raw.replace(',', '.').trim();
  if (s === '') return null;
  const n = strictParseNonNegativeMajor(s);
  if (n === null || n > 100) return null;
  return n;
}

/** Parses VAT % from a form field; accepts comma as decimal separator. */
export function parseVatRatePercentInput(raw: string): number {
  const v = validateVatRatePercentInput(raw);
  return v ?? 0;
}

/** Converts a major-unit amount string to minor units (rounded). NaN if invalid. */
export function parseAmountStringToMinorUnits(
  raw: string,
  currency: string,
  intlLocale: string
): number {
  const dec = normalizeAmountInputToDecimalString(raw);
  if (dec === null) return Number.NaN;
  const n = Number.parseFloat(dec);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  const div = minorUnitDivisor(currency, intlLocale);
  return Math.round(n * div);
}

/** Inverse for form fields: minor units → display string (comma decimal for RU locale). */
export function minorUnitsToAmountInputString(
  amountMinor: number,
  currency: string,
  appLocale: string
): string {
  const intlLocale = appLocale.startsWith('ru') ? 'ru-RU' : 'en-US';
  const div = minorUnitDivisor(currency, intlLocale);
  const major = amountMinor / div;
  if (!Number.isFinite(major)) return '';
  const maxFrac = div <= 1 ? 0 : Math.min(8, Math.round(Math.log10(div)));
  let s = major.toFixed(maxFrac);
  s = s.replace(/\.?0+$/, '');
  if (appLocale.startsWith('ru')) {
    s = s.replace('.', ',');
  }
  return s;
}
