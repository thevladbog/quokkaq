package repository

import (
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"
)

// UserUnitPermissionsMatchCanonical reports whether stored perms contain the required catalog
// permission (dot notation) or any legacy alias from rbac.CanonicalPermissionVariants.
func UserUnitPermissionsMatchCanonical(perms []string, required string) bool {
	variants := rbac.CanonicalPermissionVariants(required)
	if len(variants) == 0 {
		return false
	}
	set := make(map[string]struct{}, len(variants))
	for _, v := range variants {
		set[strings.TrimSpace(v)] = struct{}{}
	}
	for _, p := range perms {
		if _, ok := set[strings.TrimSpace(p)]; ok {
			return true
		}
	}
	return false
}

// UserHasCanonicalUnitPermission returns true if the user has the required permission (or legacy alias) on unitID.
func UserHasCanonicalUnitPermission(user *models.User, unitID, required string) bool {
	if user == nil || unitID == "" || strings.TrimSpace(required) == "" {
		return false
	}
	for _, uu := range user.Units {
		if uu.UnitID != unitID {
			continue
		}
		raw := []string(uu.Permissions)
		if UserUnitPermissionsMatchCanonical(raw, required) {
			return true
		}
	}
	return false
}
