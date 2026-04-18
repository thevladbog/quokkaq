import { z } from 'zod';
import {
  SubscriptionPlanSchema,
  type SubscriptionPlan
} from '@quokkaq/shared-types';
import { sortPublicSubscriptionPlans } from '@quokkaq/subscription-pricing';
import { getSubscriptionPlans } from '@/lib/api/generated/subscriptions';

const plansResponseSchema = z.array(SubscriptionPlanSchema);

/**
 * Fetches public subscription plans (server) via Orval-generated client.
 */
export async function fetchMarketingSubscriptionPlans(): Promise<
  SubscriptionPlan[] | null
> {
  const raw =
    process.env.MARKETING_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  if (!raw) {
    return null;
  }
  try {
    const res = await getSubscriptionPlans();
    if (res.status !== 200 || !Array.isArray(res.data)) {
      return null;
    }
    const parsed = plansResponseSchema.safeParse(res.data);
    if (!parsed.success) {
      return null;
    }
    return parsed.data
      .filter(
        (p) =>
          p.isActive !== false &&
          p.isPublic !== false &&
          p.code !== 'grandfathered'
      )
      .sort(sortPublicSubscriptionPlans);
  } catch {
    return null;
  }
}

/** Base URL of the product web app (no trailing slash), for signup/contact links. */
export function marketingAppBaseUrl(): string | null {
  const u =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    '';
  return u ? u.replace(/\/$/, '') : null;
}
