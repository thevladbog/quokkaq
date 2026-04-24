/**
 * Unit permission keys: canonical dot-notation (aligned with backend rbac) plus legacy
 * SCREAMING_SNAKE_CASE still stored in DB for older rows.
 */

import type { User } from '@/lib/api';

export const PermUnitSettingsManage = 'unit.settings.manage';
export const PermUnitGridManage = 'unit.grid.manage';
export const PermUnitServicesManage = 'unit.services.manage';
export const PermUnitTicketScreenManage = 'unit.ticket_screen.manage';
export const PermUnitSignageManage = 'unit.signage.manage';
export const PermUnitUsersManage = 'unit.users.manage';
export const PermUnitEmployeeIdpManage = 'unit.employee_idp.manage';
export const PermAccessStaffPanel = 'access.staff_panel';
export const PermAccessSupervisorPanel = 'access.supervisor_panel';
export const PermAccessKiosk = 'access.kiosk';
export const PermAccessTicketScreen = 'access.ticket_screen';
export const PermAccessSurveyResponses = 'access.survey_responses';
export const PermAccessStatsSubdivision = 'access.statistics.subdivision';
export const PermAccessStatsZone = 'access.statistics.zone';
export const PermTicketsRead = 'tickets.read';
export const PermTicketsWrite = 'tickets.write';
export const PermCounterOperate = 'counter.operate';
export const PermSurveyManage = 'survey.manage';
export const PermCalendarManage = 'calendar.manage';
export const PermStatisticsRead = 'statistics.read';
/** Company-catalog permission; may appear on merged unit permission lists. */
export const PermSupportReports = 'support.reports';

/** Legacy uppercase → canonical (dot). */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  UNIT_SETTINGS_MANAGE: PermUnitSettingsManage,
  UNIT_GRID_MANAGE: PermUnitGridManage,
  UNIT_SERVICES_MANAGE: PermUnitServicesManage,
  UNIT_TICKET_SCREEN_MANAGE: PermUnitTicketScreenManage,
  UNIT_SIGNAGE_MANAGE: PermUnitSignageManage,
  UNIT_USERS_MANAGE: PermUnitUsersManage,
  ACCESS_STAFF_PANEL: PermAccessStaffPanel,
  ACCESS_SUPERVISOR_PANEL: PermAccessSupervisorPanel,
  ACCESS_KIOSK: PermAccessKiosk,
  ACCESS_TICKET_SCREEN: PermAccessTicketScreen,
  ACCESS_SURVEY_RESPONSES: PermAccessSurveyResponses,
  ACCESS_STATISTICS_SUBDIVISION: PermAccessStatsSubdivision,
  ACCESS_STATISTICS_ZONE: PermAccessStatsZone,
  TICKETS_READ: PermTicketsRead,
  TICKETS_WRITE: PermTicketsWrite,
  COUNTER_OPERATE: PermCounterOperate,
  SURVEY_MANAGE: PermSurveyManage,
  CALENDAR_MANAGE: PermCalendarManage,
  STATISTICS_READ: PermStatisticsRead,
  SUPPORT_REPORTS: PermSupportReports
};

const CANONICAL_TO_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_TO_CANONICAL).map(([legacy, canon]) => [canon, legacy])
) as Record<string, string>;

/** All strings that grant the same capability as `canonical` (dot-notation). */
export function unitPermissionVariants(canonical: string): string[] {
  const c = LEGACY_TO_CANONICAL[canonical] ?? canonical;
  const legacy = CANONICAL_TO_LEGACY[c];
  if (legacy && legacy !== c) {
    return [c, legacy];
  }
  return [c];
}

/** Whether `userPerms` grants `canonical` (accepts stored legacy or canonical). */
export function userUnitPermissionMatches(
  userPerms: string[],
  canonical: string
): boolean {
  const variants = new Set(unitPermissionVariants(canonical));
  return userPerms.some((p) => variants.has(p));
}

/** Whether flattened perms (all units) include `canonical`. */
export function flatPermissionsInclude(
  flat: string[],
  canonical: string
): boolean {
  return userUnitPermissionMatches(flat, canonical);
}

/** Stable SCREAMING key for `admin.users.permissions_list.*` in messages/*.json */
export function permissionListMessageKey(id: string): string {
  if (id.includes('_') && id === id.toUpperCase()) {
    return id;
  }
  return CANONICAL_TO_LEGACY[id] ?? id;
}

/** True if `user` has `canonical` (or legacy alias) on the given unit. */
export function userHasCanonicalUnitPermission(
  user: User | null | undefined,
  unitId: string,
  canonical: string
): boolean {
  if (!user?.permissions || !unitId) return false;
  const perms = user.permissions[unitId];
  if (!perms?.length) return false;
  return userUnitPermissionMatches(perms, canonical);
}

/** True if `user` has `canonical` (or legacy alias) on at least one unit. */
export function userHasCanonicalUnitPermissionInAnyUnit(
  user: User | null | undefined,
  canonical: string
): boolean {
  if (!user?.permissions) return false;
  const set = new Set(unitPermissionVariants(canonical));
  return (Object.values(user.permissions) as string[][]).some((perms) =>
    perms.some((p) => set.has(p))
  );
}
