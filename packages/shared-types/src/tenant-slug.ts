/**
 * Tenant slug normalization and reserved names — keep in sync with
 * `apps/backend/internal/pkg/tenantslug/slug.go` (reserved map, Normalize, Validate, slugPart).
 */

export const TENANT_SLUG_MIN_LEN = 3;
export const TENANT_SLUG_MAX_LEN = 63;

/** Same keys as Go `tenantslug.reserved`. */
export const RESERVED_TENANT_SLUGS = new Set<string>([
  'www',
  'api',
  'admin',
  'login',
  'auth',
  'static',
  'health',
  'swagger',
  'docs',
  'ws',
  'system',
  'en',
  'ru',
  't'
]);

/** Mirrors Go `tenantslug.Normalize`. */
export function normalizeTenantSlug(raw: string): string {
  const s = raw.trim().toLowerCase();
  let out = '';
  let prevDash = false;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
      prevDash = false;
    } else if (ch === ' ' || ch === '-' || ch === '_') {
      if (out.length > 0 && !prevDash) {
        out += '-';
        prevDash = true;
      }
    }
  }
  out = out.replace(/^-+|-+$/g, '');
  while (out.includes('--')) {
    out = out.replace(/--/g, '-');
  }
  return out;
}

/** Mirrors Go `tenantslug.IsReserved` (trim + ASCII lower case). */
export function isReservedTenantSlug(s: string): boolean {
  return RESERVED_TENANT_SLUGS.has(s.trim().toLowerCase());
}

/** Same pattern as Go `slugPart` regexp. */
export const TENANT_SLUG_PART_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Client-side slug validity (length, pattern, not reserved). Mirrors Go `tenantslug.Validate` logic without error strings. */
export function isValidTenantSlug(s: string): boolean {
  if (s.length < TENANT_SLUG_MIN_LEN || s.length > TENANT_SLUG_MAX_LEN) {
    return false;
  }
  if (!TENANT_SLUG_PART_RE.test(s)) {
    return false;
  }
  if (RESERVED_TENANT_SLUGS.has(s)) {
    return false;
  }
  return true;
}
