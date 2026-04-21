package rbac

import "strings"

// CanonicalPermissionVariants returns all stored key variants to match for middleware
// (dot-notation catalog + legacy SCREAMING_SNAKE_CASE from user_units).
func CanonicalPermissionVariants(required string) []string {
	required = strings.TrimSpace(required)
	if required == "" {
		return nil
	}
	seen := map[string]struct{}{required: {}}
	out := []string{required}
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}

	// Legacy uppercase aliases used in user_units.permissions and frontend.
	switch required {
	case PermAccessStaffPanel:
		add("ACCESS_STAFF_PANEL")
	case PermAccessSupervisorPanel:
		add("ACCESS_SUPERVISOR_PANEL")
	case PermAccessKiosk:
		add("ACCESS_KIOSK")
	case PermAccessTicketScreen:
		add("ACCESS_TICKET_SCREEN")
	case PermAccessSurveyResponses:
		add("ACCESS_SURVEY_RESPONSES")
	case PermAccessStatsSubdivision:
		add("ACCESS_STATISTICS_SUBDIVISION")
	case PermAccessStatsZone:
		add("ACCESS_STATISTICS_ZONE")
	case PermUnitSettingsManage:
		add("UNIT_SETTINGS_MANAGE")
	case PermUnitGridManage:
		add("UNIT_GRID_MANAGE")
	case PermUnitServicesManage:
		add("UNIT_SERVICES_MANAGE")
	case PermUnitTicketScreenManage:
		add("UNIT_TICKET_SCREEN_MANAGE")
	case PermUnitUsersManage:
		add("UNIT_USERS_MANAGE")
	}
	return out
}

// StatisticsAccessPermissionVariants returns canonical keys whose variants (see CanonicalPermissionVariants)
// grant statistics API access. Legacy SCREAMING_SNAKE aliases are covered via those variants.
func StatisticsAccessPermissionVariants() []string {
	return []string{
		PermStatisticsRead,
		PermAccessStatsSubdivision,
		PermAccessStatsZone,
	}
}
