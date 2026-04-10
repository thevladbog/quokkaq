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
    s = `${parts[0]}.${parts[1]}`;
  }
  if (s === '' || s === '.' || s === '-') return null;
  if (/e/i.test(s)) return null;
  const dotParts = s.split('.');
  if (dotParts.length > 2) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return s;
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
