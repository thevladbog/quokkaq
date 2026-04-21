package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
)

// Tenant system_admin coverage (shift journal):
// No explicit system_admin slug check. Tenant system_admin users get access.supervisor_panel (and the
// full catalog) on all units via merged user_units from tenant roles. This function therefore grants
// full journal when UserHasCanonicalUnitPermission(..., PermAccessSupervisorPanel) is true on the unit.

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
	return UserHasCanonicalUnitPermission(user, unitID, rbac.PermAccessSupervisorPanel)
}
