import type { SubscriptionPlan } from '@quokkaq/shared-types';
import {
  API_BOOL_FEATURE_TO_PRICING,
  PLAN_LIMIT_KEYS
} from './plan-manifest';

const UNLIMITED_BY_LIMIT: Record<(typeof PLAN_LIMIT_KEYS)[number], string> = {
  units: 'unlimitedUnits',
  users: 'unlimitedUsers',
  tickets_per_month: 'unlimitedTickets',
  services: 'unlimitedServices',
  counters: 'unlimitedCounters',
  zones_per_unit: 'unlimitedZonesPerUnit'
};

const NEGOTIABLE_BY_LIMIT: Record<(typeof PLAN_LIMIT_KEYS)[number], string> = {
  units: 'negotiableUnits',
  users: 'negotiableUsers',
  tickets_per_month: 'negotiableTickets',
  services: 'negotiableServices',
  counters: 'negotiableCounters',
  zones_per_unit: 'negotiableZonesPerUnit'
};

function limitToPricingFeatureKey(
  limitKey: (typeof PLAN_LIMIT_KEYS)[number]
): string {
  if (limitKey === 'tickets_per_month') return 'tickets';
  if (limitKey === 'zones_per_unit') return 'zonesPerUnit';
  return limitKey;
}

const FEATURE_FLAG_ORDER = Object.keys(
  API_BOOL_FEATURE_TO_PRICING
) as (keyof typeof API_BOOL_FEATURE_TO_PRICING)[];

export type PricingFeatureRow = {
  rowKey: string;
  translationKey: string;
  count?: number;
};

function isNegotiableLimit(
  plan: SubscriptionPlan,
  lk: (typeof PLAN_LIMIT_KEYS)[number]
): boolean {
  const m = plan.limitsNegotiable;
  if (!m || typeof m !== 'object') return false;
  return Boolean((m as Record<string, boolean>)[lk]);
}

/** Rows for public pricing UI from an API plan (limits + enabled flags). */
export function buildPricingRowsFromApiPlan(
  plan: SubscriptionPlan
): PricingFeatureRow[] {
  const rows: PricingFeatureRow[] = [];
  const limits = plan.limits ?? {};

  for (const lk of PLAN_LIMIT_KEYS) {
    if (isNegotiableLimit(plan, lk)) {
      rows.push({
        rowKey: `lim-neg-${lk}`,
        translationKey: `features.${NEGOTIABLE_BY_LIMIT[lk]}`
      });
      continue;
    }
    const v = limits[lk];
    if (v === undefined) continue;
    if (v === -1) {
      rows.push({
        rowKey: `lim-${lk}`,
        translationKey: `features.${UNLIMITED_BY_LIMIT[lk]}`
      });
    } else {
      rows.push({
        rowKey: `lim-${lk}`,
        translationKey: `features.${limitToPricingFeatureKey(lk)}`,
        count: v
      });
    }
  }

  const feats = plan.features ?? {};
  const enabledKeys = FEATURE_FLAG_ORDER.filter((k) => feats[k]);
  for (const apiKey of enabledKeys) {
    const pk = API_BOOL_FEATURE_TO_PRICING[apiKey];
    if (!pk) continue;
    rows.push({ rowKey: `feat-${apiKey}`, translationKey: `features.${pk}` });
  }

  return rows;
}
