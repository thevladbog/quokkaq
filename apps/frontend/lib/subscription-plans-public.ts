import { z } from 'zod';
import {
  SubscriptionPlanSchema,
  type SubscriptionPlan
} from '@quokkaq/shared-types';
import { sortPublicSubscriptionPlans } from '@quokkaq/subscription-pricing';
import { getSubscriptionPlans } from '@/lib/api/generated/public-subscriptions';
import { logger } from '@/lib/logger';

const plansResponseSchema = z.array(SubscriptionPlanSchema);

/**
 * Fetches public subscription plans from the API (server-side) via Orval.
 * Returns null if the URL is missing, the request fails, or parsing fails.
 */
export async function fetchPublicSubscriptionPlans(): Promise<
  SubscriptionPlan[] | null
> {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();
  if (!base) {
    return null;
  }
  try {
    const res = await getSubscriptionPlans();
    if (res.status !== 200 || !Array.isArray(res.data)) {
      return null;
    }
    const parsed = plansResponseSchema.safeParse(res.data);
    if (!parsed.success) {
      logger.error('fetchPublicSubscriptionPlans parse failed', {
        error: parsed.error.flatten()
      });
      return null;
    }
    return parsed.data
      .filter((p) => p.isActive && p.code !== 'grandfathered')
      .sort(sortPublicSubscriptionPlans);
  } catch (err) {
    logger.error('fetchPublicSubscriptionPlans failed', { error: err });
    return null;
  }
}
