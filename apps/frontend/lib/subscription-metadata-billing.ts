/** True when subscription JSON metadata marks annual prepay preference (Stripe / signup). */
export function subscriptionMetadataPrefersAnnual(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  return (
    (metadata as Record<string, unknown>)['preferredBillingPeriod'] === 'annual'
  );
}
