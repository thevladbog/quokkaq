import type { User } from '@quokkaq/shared-types';

/** Whether /platform may be opened by tenant `admin` (not only `platform_admin`). */
export function platformRouteAllowsTenantAdmin(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_PLATFORM_ALLOW_TENANT_ADMIN === 'true' ||
    process.env.NEXT_PUBLIC_PLATFORM_ALLOW_TENANT_ADMIN === '1'
  );
}

/**
 * User may open the SaaS operator UI: `platform_admin`, or tenant `admin` when
 * {@link platformRouteAllowsTenantAdmin} is true.
 */
export function userCanOpenPlatformOperatorUI(
  user: Pick<User, 'roles'> | null | undefined
): boolean {
  const roles = user?.roles;
  if (!roles?.length) return false;
  if (roles.includes('platform_admin')) return true;
  return platformRouteAllowsTenantAdmin() && roles.includes('admin');
}
