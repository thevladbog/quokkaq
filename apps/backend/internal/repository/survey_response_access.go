package repository

import (
	"strings"

	"quokkaq-go-backend/internal/models"
)

const permAccessSurveyResponses = "ACCESS_SURVEY_RESPONSES"

// UserCanViewSurveyResponses is true when the user may read stored survey responses for the given unit
// (aggregates, per-client, exports). Does not follow from client-card access alone.
func UserCanViewSurveyResponses(user *models.User, unitID string) bool {
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
			if strings.TrimSpace(p) == permAccessSurveyResponses {
				return true
			}
		}
	}
	return false
}
