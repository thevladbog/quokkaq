import type { User } from '@/lib/api';

/** Full tenant control: global admin, platform operator, or tenant system_admin role. */
export function isTenantAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.isPlatformAdmin === true) return true;
  if (user.roles?.includes('admin')) return true;
  return user.isTenantAdmin === true;
}
