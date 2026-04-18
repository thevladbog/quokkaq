import type { SubscriptionPlan } from '@quokkaq/shared-types';

const PLAN_ORDER = ['starter', 'professional', 'enterprise'] as const;

export function sortPublicSubscriptionPlans(
  a: SubscriptionPlan,
  b: SubscriptionPlan
): number {
  const oa = a.displayOrder ?? 1000;
  const ob = b.displayOrder ?? 1000;
  if (oa !== ob) {
    return oa - ob;
  }
  const ia = PLAN_ORDER.indexOf(a.code as (typeof PLAN_ORDER)[number]);
  const ib = PLAN_ORDER.indexOf(b.code as (typeof PLAN_ORDER)[number]);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
}
