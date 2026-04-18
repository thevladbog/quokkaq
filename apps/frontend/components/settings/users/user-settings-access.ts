import type { Unit, User } from '@quokkaq/shared-types';

export function getAvailableUnitsForManager(
  units: Unit[],
  currentUser: User | undefined
): Unit[] {
  if (!units.length) return [];
  if (currentUser?.roles?.includes('admin')) {
    return units;
  }
  const allowedUnitIds = Object.entries(currentUser?.permissions || {})
    .filter(([, perms]) => (perms as string[]).includes('UNIT_USERS_MANAGE'))
    .map(([unitId]) => unitId);
  const allowed = new Set(allowedUnitIds);
  return units.filter((u) => allowed.has(u.id));
}

export function canManageUnitUsers(
  currentUser: User | undefined,
  unitId: string
): boolean {
  if (currentUser?.roles?.includes('admin')) return true;
  const perms = currentUser?.permissions?.[unitId] || [];
  return perms.includes('UNIT_USERS_MANAGE');
}
