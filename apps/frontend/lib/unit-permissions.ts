/**
 * Canonical list of assignable per-unit permission IDs and default English labels.
 * UI copy should come from next-intl (`admin.users.permissions_list.*`); labels here
 * match `messages/en.json` for tooling and non-translated contexts.
 */
export const UNIT_PERMISSIONS = [
  { id: 'UNIT_SETTINGS_MANAGE', label: 'Manage Unit Settings' },
  { id: 'UNIT_GRID_MANAGE', label: 'Manage Grid' },
  { id: 'UNIT_SERVICES_MANAGE', label: 'Manage Services' },
  { id: 'UNIT_TICKET_SCREEN_MANAGE', label: 'Manage Ticket Screen' },
  { id: 'UNIT_USERS_MANAGE', label: 'Manage Unit Users' },
  { id: 'ACCESS_STAFF_PANEL', label: 'Access Staff Panel' },
  { id: 'ACCESS_KIOSK', label: 'Access Kiosk' },
  { id: 'ACCESS_TICKET_SCREEN', label: 'Access Ticket Screen' },
  { id: 'ACCESS_SUPERVISOR_PANEL', label: 'Access Supervisor Panel' },
  { id: 'ACCESS_SURVEY_RESPONSES', label: 'View guest survey ratings' },
  {
    id: 'ACCESS_STATISTICS_SUBDIVISION',
    label: 'Statistics: whole subdivision'
  },
  {
    id: 'ACCESS_STATISTICS_ZONE',
    label: 'Statistics: assigned service zones only'
  }
] as const;

export type UnitPermissionId = (typeof UNIT_PERMISSIONS)[number]['id'];

export type UnitPermission = (typeof UNIT_PERMISSIONS)[number];

/** Ordered permission id list (same order as `UNIT_PERMISSIONS`). */
export const UNIT_PERMISSION_IDS: readonly UnitPermissionId[] =
  UNIT_PERMISSIONS.map((p) => p.id);
