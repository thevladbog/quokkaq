import type { SubscriptionPlan } from '@quokkaq/shared-types';

/** True when the plan lists a 12-month prepay option (monthly interval + discount or fixed effective monthly). */
export function planSupportsAnnualPrepay(plan: SubscriptionPlan): boolean {
  if (plan.isFree || plan.interval !== 'month' || plan.price <= 0) {
    return false;
  }
  const d = plan.annualPrepayDiscountPercent;
  const m = plan.annualPrepayPricePerMonth;
  if (d != null && m != null) {
    return false;
  }
  if (d != null) {
    return Number.isInteger(d) && d >= 1 && d <= 100;
  }
  if (m != null) {
    return Number.isFinite(m) && m > 0;
  }
  return false;
}

/** Total minor units charged once per year in Stripe for annual prepay checkout. */
export function annualPrepayStripeYearlyUnitAmountMinor(
  plan: SubscriptionPlan
): number | null {
  if (!planSupportsAnnualPrepay(plan)) {
    return null;
  }
  const ppm = plan.annualPrepayPricePerMonth;
  if (ppm != null) {
    return Math.trunc(ppm * 12);
  }
  const pct = plan.annualPrepayDiscountPercent;
  if (pct == null) {
    return null;
  }
  return Math.trunc((plan.price * 12 * (100 - pct)) / 100);
}

/** Effective monthly price in minor units when paying for 12 months (display). */
export function annualPrepayEffectiveMonthlyMinor(
  plan: SubscriptionPlan
): number | null {
  const yearly = annualPrepayStripeYearlyUnitAmountMinor(plan);
  if (yearly == null) {
    return null;
  }
  return Math.trunc(yearly / 12);
}

/** Approximate savings vs 12× list monthly (minor units); null if not applicable. */
export function annualPrepaySavingsMinorUnits(
  plan: SubscriptionPlan
): number | null {
  const yearly = annualPrepayStripeYearlyUnitAmountMinor(plan);
  if (yearly == null) {
    return null;
  }
  return Math.max(0, plan.price * 12 - yearly);
}

/**
 * Discount percent for marketing/UI: explicit annualPrepayDiscountPercent, or an
 * equivalent rounded % when only annualPrepayPricePerMonth is set (vs list monthly).
 */
export function annualPrepayDisplayDiscountPercent(
  plan: SubscriptionPlan
): number | null {
  if (!planSupportsAnnualPrepay(plan)) {
    return null;
  }
  const d = plan.annualPrepayDiscountPercent;
  if (d != null) {
    return d;
  }
  const ppm = plan.annualPrepayPricePerMonth;
  if (ppm != null && plan.price > 0) {
    const raw = (1 - ppm / plan.price) * 100;
    return Math.max(0, Math.min(99, Math.round(raw)));
  }
  return null;
}
