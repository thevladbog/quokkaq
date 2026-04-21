import type { User } from '@quokkaq/shared-types';
import {
  PermAccessSupervisorPanel,
  userUnitPermissionMatches
} from '@/lib/permission-variants';
import { isTenantAdminUser } from '@/lib/tenant-admin-access';

/**
 * Mirrors backend ShiftJournalSeesAllActivity: full journal vs own actions only.
 * Uses tenant admin / platform operator / global admin via `isTenantAdminUser`, else
 * `access.supervisor_panel` on this unit (legacy global `supervisor` should have the perm via migration).
 */
export function userSeesFullShiftJournal(
  user: User | null | undefined,
  unitId: string
): boolean {
  if (!user || !unitId) return false;
  if (isTenantAdminUser(user)) return true;
  const perms = user.permissions?.[unitId];
  return userUnitPermissionMatches(perms ?? [], PermAccessSupervisorPanel);
}
