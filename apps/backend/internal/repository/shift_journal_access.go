package repository

import (
	"strings"

	"quokkaq-go-backend/internal/models"
)

const permAccessSupervisorPanel = "ACCESS_SUPERVISOR_PANEL"

// shiftJournalSeesAllActivityFromLoadedUser reports whether the user may see all shift journal
// (ticket history) rows in the given unit, as opposed to only rows where they are the actor.
func shiftJournalSeesAllActivityFromLoadedUser(user *models.User, unitID string) bool {
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
			if strings.TrimSpace(p) == permAccessSupervisorPanel {
				return true
			}
		}
		break
	}
	return false
}
