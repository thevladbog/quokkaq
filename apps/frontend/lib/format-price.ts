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
