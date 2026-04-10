import type { PaymentAccount } from '@quokkaq/shared-types';

/** Only the account marked default; no fallback to first item. */
export function pickDefaultPaymentAccount(
  accounts: PaymentAccount[] | null | undefined
): PaymentAccount | undefined {
  if (!accounts?.length) return undefined;
  return accounts.find((a) => a.isDefault === true);
}
