/**
 * Build-time flags for browser RUM. Only `NEXT_PUBLIC_*` vars are available in the client bundle.
 */
const otelBrowserRumTruthy = new Set(['true', '1', 'yes', 'y']);

export function isOtelBrowserRumEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_OTEL_ENABLED ?? '').trim().toLowerCase();
  return otelBrowserRumTruthy.has(v);
}
