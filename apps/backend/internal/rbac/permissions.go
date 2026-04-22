// Package rbac defines the global permission catalog (same keys for all tenants).
package rbac

// LegacyGlobalRoleAdmin is the legacy global roles.name for tenant-wide superuser (pre–tenant RBAC).
const LegacyGlobalRoleAdmin = "admin"

// Company-scoped (tenant-wide) permissions.
const (
	PermTenantAdmin       = "tenant.admin"
	PermUsersManage       = "users.manage"
	PermUnitsManage       = "units.manage"
	PermTicketsRead       = "tickets.read"
	PermTicketsWrite      = "tickets.write"
	PermStatisticsRead    = "statistics.read"
	PermSupportReports    = "support.reports"
	PermKioskManage       = "kiosk.manage"
	PermCounterOperate    = "counter.operate"
	PermSurveyManage      = "survey.manage"
	PermCalendarManage    = "calendar.manage"
	PermTemplatesManage   = "templates.manage"
	PermInvitationsManage = "invitations.manage"
)

// Unit-scoped permissions (stored on user_units.permissions and tenant_role_units.permissions).
const (
	PermUnitSettingsManage     = "unit.settings.manage"
	PermUnitGridManage         = "unit.grid.manage"
	PermUnitServicesManage     = "unit.services.manage"
	PermUnitTicketScreenManage = "unit.ticket_screen.manage"
	// PermUnitSignageManage controls extended digital signage (playlists, schedules, feeds, screen templates).
	PermUnitSignageManage      = "unit.signage.manage"
	PermUnitUsersManage        = "unit.users.manage"
	PermAccessStaffPanel       = "access.staff_panel"
	PermAccessSupervisorPanel  = "access.supervisor_panel"
	PermAccessKiosk            = "access.kiosk"
	PermAccessTicketScreen     = "access.ticket_screen"
	PermAccessSurveyResponses  = "access.survey_responses"
	PermAccessStatsSubdivision = "access.statistics.subdivision"
	PermAccessStatsZone        = "access.statistics.zone"
)

// DefaultInvitationUnitPermissions is used when an invitation must ensure tenant membership
// but specifies no target units (replaces legacy global "staff" role defaults).
func DefaultInvitationUnitPermissions() []string {
	return []string{
		PermTicketsRead,
		PermTicketsWrite,
		PermCounterOperate,
		PermAccessStaffPanel,
	}
}

// All returns every known permission (for API catalog).
func All() []string {
	return []string{
		PermTenantAdmin,
		PermUsersManage,
		PermUnitsManage,
		PermTicketsRead,
		PermTicketsWrite,
		PermStatisticsRead,
		PermSupportReports,
		PermKioskManage,
		PermCounterOperate,
		PermSurveyManage,
		PermCalendarManage,
		PermTemplatesManage,
		PermInvitationsManage,
		PermUnitSettingsManage,
		PermUnitGridManage,
		PermUnitServicesManage,
		PermUnitTicketScreenManage,
		PermUnitSignageManage,
		PermUnitUsersManage,
		PermAccessStaffPanel,
		PermAccessSupervisorPanel,
		PermAccessKiosk,
		PermAccessTicketScreen,
		PermAccessSurveyResponses,
		PermAccessStatsSubdivision,
		PermAccessStatsZone,
	}
}
