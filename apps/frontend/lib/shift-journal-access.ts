import type { User } from '@quokkaq/shared-types';

/**
 * Mirrors backend ShiftJournalSeesAllActivity: full journal vs own actions only.
 */
export function userSeesFullShiftJournal(
  user: Pick<User, 'roles' | 'permissions'> | null | undefined,
  unitId: string
): boolean {
  const roles = user?.roles ?? [];
  if (
    roles.includes('admin') ||
    roles.includes('platform_admin') ||
    roles.includes('supervisor')
  ) {
    return true;
  }
  const perms = user?.permissions?.[unitId];
  return Boolean(perms?.includes('ACCESS_SUPERVISOR_PANEL'));
}
