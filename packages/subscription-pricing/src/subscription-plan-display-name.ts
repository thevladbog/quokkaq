import type { SubscriptionPlan } from '@quokkaq/shared-types';

/**
 * Primary `name` is the default catalog title (e.g. Russian on the RU site).
 * When `nameEn` is set, English UI uses it; otherwise English falls back to `name`.
 */
export function subscriptionPlanDisplayName(
  plan: Pick<SubscriptionPlan, 'name' | 'nameEn'>,
  locale: string
): string {
  const primary = plan.name ?? '';
  const en =
    typeof plan.nameEn === 'string' && plan.nameEn.trim() !== ''
      ? plan.nameEn.trim()
      : primary;
  if (locale === 'en' || locale.startsWith('en-')) {
    return en;
  }
  return primary;
}
