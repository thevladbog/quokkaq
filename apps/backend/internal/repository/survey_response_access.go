package repository

import (
	"strings"

	"quokkaq-go-backend/internal/models"
)

const permAccessSurveyResponses = "ACCESS_SURVEY_RESPONSES"

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
