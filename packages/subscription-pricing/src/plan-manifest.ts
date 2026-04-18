/** Quota limit keys aligned with backend `quotaMetricKeys`. */
export const PLAN_LIMIT_KEYS = [
  'units',
  'users',
  'tickets_per_month',
  'services',
  'counters'
] as const;

export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

/** Maps API feature flag keys to i18n suffixes under `features.*` in pricing copy. */
export const API_BOOL_FEATURE_TO_PRICING: Record<string, string> = {
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

const BASE_FEATURE_KEYS = Object.keys(
  API_BOOL_FEATURE_TO_PRICING
) as (keyof typeof API_BOOL_FEATURE_TO_PRICING)[];

/** All boolean feature keys for platform plan constructor + stable iteration order. */
export const PLAN_FEATURE_KEYS = [
  ...BASE_FEATURE_KEYS,
  'counter_guest_survey'
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];
