/**
 * Canonical list of assignable per-unit permission IDs (dot notation) and default English labels.
 * UI copy should come from next-intl (`admin.users.permissions_list.*`); keys in messages use
 * legacy SCREAMING_CASE — use `permissionListMessageKey(id)` when translating.
 */
import {
  PermAccessKiosk,
  PermAccessStaffPanel,
  PermAccessStatsSubdivision,
  PermAccessStatsZone,
  PermAccessSupervisorPanel,
  PermAccessSurveyResponses,
  PermAccessTicketScreen,
  PermCalendarManage,
  PermCounterOperate,
  PermStatisticsRead,
  PermSurveyManage,
  PermTicketsRead,
  PermTicketsWrite,
  PermUnitGridManage,
  PermUnitServicesManage,
  PermUnitSettingsManage,
  PermUnitTicketScreenManage,
  PermUnitUsersManage
} from '@/lib/permission-variants';

export const UNIT_PERMISSIONS = [
  { id: PermUnitSettingsManage, label: 'Manage Unit Settings' },
  { id: PermUnitGridManage, label: 'Manage Grid' },
  { id: PermUnitServicesManage, label: 'Manage Services' },
  { id: PermUnitTicketScreenManage, label: 'Manage Ticket Screen' },
  { id: PermUnitUsersManage, label: 'Manage Unit Users' },
  { id: PermTicketsRead, label: 'View tickets' },
  { id: PermTicketsWrite, label: 'Create and update tickets' },
  { id: PermCounterOperate, label: 'Operate counters' },
  { id: PermSurveyManage, label: 'Manage surveys' },
  { id: PermCalendarManage, label: 'Manage calendar integration' },
  { id: PermStatisticsRead, label: 'View statistics' },
  { id: PermAccessStaffPanel, label: 'Access Staff Panel' },
  { id: PermAccessKiosk, label: 'Access Kiosk' },
  { id: PermAccessTicketScreen, label: 'Access Ticket Screen' },
  { id: PermAccessSupervisorPanel, label: 'Access Supervisor Panel' },
  { id: PermAccessSurveyResponses, label: 'View guest survey ratings' },
  {
    id: PermAccessStatsSubdivision,
    label: 'Statistics: whole subdivision'
  },
  {
    id: PermAccessStatsZone,
    label: 'Statistics: assigned service zones only'
  }
] as const;

export type UnitPermissionId = (typeof UNIT_PERMISSIONS)[number]['id'];

export type UnitPermission = (typeof UNIT_PERMISSIONS)[number];

/** Ordered permission id list (same order as `UNIT_PERMISSIONS`). */
export const UNIT_PERMISSION_IDS: readonly UnitPermissionId[] =
  UNIT_PERMISSIONS.map((p) => p.id);
