package repository

import (
	"strings"

	"quokkaq-go-backend/internal/models"
)

const permAccessSurveyResponses = "ACCESS_SURVEY_RESPONSES"
const permStatisticsSubdivision = "ACCESS_STATISTICS_SUBDIVISION"

// UserCanViewSurveyResponses is true when the user may read stored survey responses for the given unit
// (aggregates, per-client, exports). Does not follow from client-card access alone.
// Tenant roles (admin, supervisor, staff, operator) must have ACCESS_SURVEY_RESPONSES on the unit;
// platform_admin may read for support.
func UserCanViewSurveyResponses(user *models.User, unitID string) bool {
	if user == nil || unitID == "" {
		return false
	}
	for _, ur := range user.Roles {
		if ur.Role.Name == "platform_admin" {
			return true
		}
	}
	for _, uu := range user.Units {
		if uu.UnitID != unitID {
			continue
		}
		for _, p := range uu.Permissions {
			if strings.TrimSpace(p) == permAccessSurveyResponses {
				return true
			}
		}
	}
	return false
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
		case "admin", "platform_admin", "supervisor":
			return true
		}
	}
	for _, uu := range user.Units {
		if uu.UnitID != unitID {
			continue
		}
		for _, p := range uu.Permissions {
			if strings.TrimSpace(p) == permStatisticsSubdivision {
				return true
			}
		}
	}
	return false
}
