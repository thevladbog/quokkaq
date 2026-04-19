// Package rbac defines the global permission catalog (same keys for all tenants).
package rbac

// Permission keys for tenant-scoped RBAC and future middleware checks.
const (
	PermTenantAdmin    = "tenant.admin"
	PermUsersManage    = "users.manage"
	PermUnitsManage    = "units.manage"
	PermTicketsRead    = "tickets.read"
	PermTicketsWrite   = "tickets.write"
	PermStatisticsRead = "statistics.read"
	PermSupportReports = "support.reports"
	PermKioskManage    = "kiosk.manage"
	PermCounterOperate = "counter.operate"
	PermSurveyManage   = "survey.manage"
	PermCalendarManage = "calendar.manage"
)

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
	}
}

// LegacyRolePermissions maps global role names to permission sets (compatibility layer).
func LegacyRolePermissions(roleName string) []string {
	switch roleName {
	case "admin":
		return All()
	case "supervisor":
		return []string{
			PermTicketsRead, PermTicketsWrite, PermStatisticsRead,
			PermCounterOperate, PermSurveyManage, PermCalendarManage,
		}
	case "staff", "operator":
		return []string{
			PermTicketsRead, PermTicketsWrite, PermCounterOperate,
		}
	default:
		return nil
	}
}
