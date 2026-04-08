import type { SubscriptionPlan } from '@quokkaq/shared-types';

const LIMIT_KEYS_ORDER = ['units', 'users', 'tickets_per_month', 'services', 'counters'] as const;

const UNLIMITED_BY_LIMIT: Record<(typeof LIMIT_KEYS_ORDER)[number], string> = {
  units: 'unlimitedUnits',
  users: 'unlimitedUsers',
  tickets_per_month: 'unlimitedTickets',
  services: 'unlimitedServices',
  counters: 'unlimitedCounters'
};

function limitToPricingFeatureKey(limitKey: (typeof LIMIT_KEYS_ORDER)[number]): string {
  if (limitKey === 'tickets_per_month') return 'tickets';
  return limitKey;
}

const API_BOOL_FEATURE_TO_PRICING: Record<string, string> = {
  basic_support: 'basicSupport',
  websocket_updates: 'realtimeUpdates',
  basic_reports: 'basicReports',
  advanced_reports: 'advancedReports',
  email_support: 'emailSupport',
  phone_support: 'phoneSupport',
  api_access: 'apiAccess',
  white_label: 'whiteLabel',
  custom_branding: 'customBranding',
  priority_support: 'prioritySupport',
  dedicated_support: 'dedicatedSupport',
  sla_guarantee: 'slaGuarantee',
  custom_integrations: 'customIntegrations',
  team_training: 'teamTraining'
};

const FEATURE_FLAG_ORDER = Object.keys(API_BOOL_FEATURE_TO_PRICING);

export type PricingFeatureRow = {
  rowKey: string;
  translationKey: string;
  count?: number;
};

/** Rows for the public pricing page from an API plan (limits + enabled flags). */
export function buildPricingRowsFromApiPlan(plan: SubscriptionPlan): PricingFeatureRow[] {
  const rows: PricingFeatureRow[] = [];
  const limits = plan.limits ?? {};

  for (const lk of LIMIT_KEYS_ORDER) {
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
