package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
)

// Tenant system_admin coverage (survey access):
// We do not query user_tenant_roles or the system_admin slug here. Users with the reserved tenant role
// system_admin receive merged catalog permissions on all units via RebuildUserUnitsFromTenantRoles /
// tenant_role_units; those permissions include access.survey_responses and statistics.read as needed.
// Callers must load user.Units with non-empty permissions for that model to apply. HTTP middleware
// separately allows system_admin via HasTenantSystemAdminRoleInCompany where relevant.

// UserCanViewSurveyResponses is true when the user may read stored survey responses for the given unit
// (aggregates, per-client, exports). Does not follow from client-card access alone.
// Grants: platform_admin; unit permission access.survey_responses (or legacy ACCESS_SURVEY_RESPONSES);
// tenant system_admin users typically have the catalog permission on all units via merged user_units.
func UserCanViewSurveyResponses(user *models.User, unitID string) bool {
	if user == nil || unitID == "" {
		return false
	}
	for _, ur := range user.Roles {
		if ur.Role.Name == "platform_admin" {
			return true
		}
	}
	return UserHasCanonicalUnitPermission(user, unitID, rbac.PermAccessSurveyResponses)
}

// UserCanViewSurveyScoreAggregates is true when the user may read aggregated guest-survey score statistics
// for a subdivision: raw survey response access, branch-wide statistics access, or elevated tenant roles.
// (Aligns with who can open /statistics; stricter than raw response listing alone.)
func UserCanViewSurveyScoreAggregates(user *models.User, unitID string) bool {
	if UserCanViewSurveyResponses(user, unitID) {
		return true
	}
	if user == nil || unitID == "" {
		return false
	}
	for _, ur := range user.Roles {
		switch ur.Role.Name {
		case "admin", "supervisor":
			return true
		}
	}
	if UserHasCanonicalUnitPermission(user, unitID, rbac.PermAccessStatsSubdivision) {
		return true
	}
	return UserHasCanonicalUnitPermission(user, unitID, rbac.PermStatisticsRead)
}
