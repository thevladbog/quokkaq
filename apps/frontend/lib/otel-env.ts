/**
 * Build-time flags for browser RUM. Only `NEXT_PUBLIC_*` vars are available in the client bundle.
 */
export function isOtelBrowserRumEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OTEL_ENABLED === 'true';
}
