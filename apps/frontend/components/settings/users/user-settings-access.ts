import type { Unit, User } from '@quokkaq/shared-types';
import {
  PermUnitUsersManage,
  userUnitPermissionMatches
} from '@/lib/permission-variants';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';

export function getAvailableUnitsForManager(
  units: Unit[],
  currentUser: User | undefined
): Unit[] {
  if (!units.length) return [];
  if (currentUser && isTenantAdminUser(currentUser)) {
    return units;
  }
  const allowedUnitIds = Object.entries(currentUser?.permissions || {})
    .filter(([, perms]) =>
      Array.isArray(perms)
        ? userUnitPermissionMatches(perms, PermUnitUsersManage)
        : false
    )
    .map(([unitId]) => unitId);
  const allowed = new Set(allowedUnitIds);
  return units.filter((u) => allowed.has(u.id));
}

export function canManageUnitUsers(
  currentUser: User | undefined,
  unitId: string
): boolean {
  if (currentUser && isTenantAdminUser(currentUser)) return true;
  const perms = currentUser?.permissions?.[unitId] || [];
  return userUnitPermissionMatches(perms, PermUnitUsersManage);
}
