/**
 * Pushes a named event to `dataLayer` for GTM (see cookie-consent-and-gtm).
 * Safe on server: no-ops when `window` is undefined.
 */
export function pushMarketingEvent(
  name: string,
  params?: Record<string, string | number | boolean | null | undefined>
): void {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as { dataLayer?: object[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    event: 'marketing',
    event_name: name,
    ...params
  });
}
