package tenantroleseed

import (
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	"gorm.io/gorm"
)

// BackfillLegacyStaffSupervisorOperatorUnitPermissions unions default unit permissions into user_units
// for users who still have legacy global roles staff, supervisor, or operator (Phase 5.1 RBAC migration).
func BackfillLegacyStaffSupervisorOperatorUnitPermissions(db *gorm.DB) error {
	type roleRow struct {
		UserID   string `gorm:"column:user_id"`
		RoleName string `gorm:"column:role_name"`
	}
	var rows []roleRow
	if err := db.Raw(`
SELECT ur.user_id AS user_id, r.name AS role_name
FROM user_roles ur
INNER JOIN roles r ON r.id = ur.role_id
WHERE r.name IN ('staff','supervisor','operator')
`).Scan(&rows).Error; err != nil {
		return err
	}
	byUser := make(map[string]map[string]struct{})
	for _, row := range rows {
		uid := strings.TrimSpace(row.UserID)
		rn := strings.TrimSpace(row.RoleName)
		if uid == "" || rn == "" {
			continue
		}
		if byUser[uid] == nil {
			byUser[uid] = make(map[string]struct{})
		}
		byUser[uid][rn] = struct{}{}
	}
	for uid, roleSet := range byUser {
		add := collectDefaultUnitPermissionsForLegacyRoles(roleSet)
		if len(add) == 0 {
			continue
		}
		var uus []models.UserUnit
		if err := db.Where("user_id = ?", uid).Find(&uus).Error; err != nil {
			return err
		}
		for _, uu := range uus {
			merged := mergePermissionStrings(uu.Permissions, add)
			if err := db.Model(&models.UserUnit{}).Where("id = ?", uu.ID).Update("permissions", merged).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func collectDefaultUnitPermissionsForLegacyRoles(roleSet map[string]struct{}) []string {
	seen := make(map[string]struct{})
	var out []string
	for rn := range roleSet {
		for _, p := range defaultUnitPermissionsForLegacyGlobalRole(rn) {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = struct{}{}
			out = append(out, p)
		}
	}
	return out
}

func defaultUnitPermissionsForLegacyGlobalRole(roleName string) []string {
	switch strings.TrimSpace(roleName) {
	case "staff", "operator":
		out := append([]string{}, rbac.DefaultInvitationUnitPermissions()...)
		return append(out, rbac.PermSupportReports)
	case "supervisor":
		out := append([]string{}, rbac.DefaultInvitationUnitPermissions()...)
		out = append(out, rbac.PermAccessSupervisorPanel, rbac.PermSupportReports)
		return out
	default:
		return nil
	}
}

func mergePermissionStrings(existing models.StringArray, add []string) models.StringArray {
	seen := make(map[string]struct{})
	var out []string
	for _, s := range existing {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	for _, s := range add {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
