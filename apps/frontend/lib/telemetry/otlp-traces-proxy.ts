/**
 * Pure helpers for the Next.js OTLP traces proxy route (browser → same-origin → collector).
 */

/**
 * Minimal OTLP JSON traces validation: object with optional resourceSpans array.
 * Rejects non-JSON shapes; does not fully schema-validate protobuf JSON.
 */
export function validateOtlpTracePayload(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const o = parsed as Record<string, unknown>;
  if ('resourceSpans' in o && !Array.isArray(o.resourceSpans)) {
    return false;
  }
  return true;
}

/**
 * Upstream URL: `OTEL_BROWSER_INGEST_UPSTREAM` (full `/v1/traces` URL) or
 * `OTEL_EXPORTER_OTLP_ENDPOINT` base (e.g. http://localhost:4318) + `/v1/traces`.
 */
export function resolveUpstreamTracesUrl(
  env: NodeJS.ProcessEnv
): string | null {
  const explicit = env.OTEL_BROWSER_INGEST_UPSTREAM?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const base = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!base) {
    return null;
  }
  const u = base.replace(/\/+$/, '');
  if (u.endsWith('/v1/traces')) {
    return u;
  }
  return `${u}/v1/traces`;
}
