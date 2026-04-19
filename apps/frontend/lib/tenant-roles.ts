/** Reserved tenant role slug (must match backend `rbac.TenantRoleSlugSystemAdmin`). */
export const TENANT_ROLE_SLUG_SYSTEM_ADMIN = 'system_admin' as const;

export function isTenantSystemAdminSlug(
  slug: string | null | undefined
): boolean {
  return (slug ?? '').trim() === TENANT_ROLE_SLUG_SYSTEM_ADMIN;
}
