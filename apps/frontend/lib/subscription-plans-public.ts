import { z } from 'zod';
import { SubscriptionPlanSchema, type SubscriptionPlan } from '@quokkaq/shared-types';
import { logger } from '@/lib/logger';

const plansResponseSchema = z.array(SubscriptionPlanSchema);

const PLAN_ORDER = ['starter', 'professional', 'enterprise'] as const;

function sortPlans(a: SubscriptionPlan, b: SubscriptionPlan): number {
  const ia = PLAN_ORDER.indexOf(a.code as (typeof PLAN_ORDER)[number]);
  const ib = PLAN_ORDER.indexOf(b.code as (typeof PLAN_ORDER)[number]);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
}

/**
 * Fetches public subscription plans from the API (server-side).
 * Returns null if the URL is missing, the request fails, or parsing fails.
 */
export async function fetchPublicSubscriptionPlans(): Promise<SubscriptionPlan[] | null> {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  if (!base) {
    return null;
  }
  const url = `${base}/subscriptions/plans`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      return null;
    }
    const json: unknown = await res.json();
    const parsed = plansResponseSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return parsed.data.filter((p) => p.isActive && p.code !== 'grandfathered').sort(sortPlans);
  } catch (err) {
    logger.error('fetchPublicSubscriptionPlans failed', { error: err });
    return null;
  }
}
