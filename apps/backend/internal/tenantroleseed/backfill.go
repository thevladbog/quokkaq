package tenantroleseed

import (
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	"gorm.io/gorm"
)

// BackfillAllCompanies ensures the system tenant role and TRU rows for every company; assigns that role to the owner
// when they have no tenant role rows for the company, then rebuilds user_units for that owner.
func BackfillAllCompanies(db *gorm.DB) error {
	var companies []models.Company
	if err := db.Find(&companies).Error; err != nil {
		return err
	}
	for _, c := range companies {
		if err := db.Transaction(func(tx *gorm.DB) error {
			rid, err := EnsureSystemTenantRole(tx, c.ID)
			if err != nil {
				return err
			}
			ownerID := strings.TrimSpace(c.OwnerUserID)
			if ownerID == "" {
				return nil
			}
			var n int64
			if err := tx.Model(&models.UserTenantRole{}).Where("user_id = ? AND company_id = ?", ownerID, c.ID).Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				return nil
			}
			row := &models.UserTenantRole{
				UserID:       ownerID,
				CompanyID:    c.ID,
				TenantRoleID: rid,
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
			return RebuildUserUnitsFromTenantRoles(tx, ownerID, c.ID)
		}); err != nil {
			return err
		}
	}
	return nil
}

// BackfillSystemAdminUserUnits re-runs RebuildUserUnitsFromTenantRoles for every user with the
// reserved system_admin tenant role. Use after logic changes so existing DB rows get full user_units.
// BackfillLegacyGlobalAdminsToSystemTenantRole assigns the reserved system_admin tenant role
// for each (user, company) where the user has the legacy global "admin" role and at least one
// unit in that company, if they do not already have system_admin for that company.
func BackfillLegacyGlobalAdminsToSystemTenantRole(tx *gorm.DB) error {
	type uidRow struct {
		UserID string `gorm:"column:user_id"`
	}
	var adminUsers []uidRow
	if err := tx.Raw(`
SELECT DISTINCT ur.user_id AS user_id
FROM user_roles ur
INNER JOIN roles r ON r.id = ur.role_id
WHERE r.name = ?
`, rbac.LegacyGlobalRoleAdmin).Scan(&adminUsers).Error; err != nil {
		return err
	}
	for _, row := range adminUsers {
		uid := strings.TrimSpace(row.UserID)
		if uid == "" {
			continue
		}
		var companyRows []struct {
			CompanyID string `gorm:"column:company_id"`
		}
		if err := tx.Raw(`
SELECT DISTINCT u.company_id AS company_id
FROM user_units uu
INNER JOIN units u ON u.id = uu.unit_id
WHERE uu.user_id = ?
`, uid).Scan(&companyRows).Error; err != nil {
			return err
		}
		for _, cr := range companyRows {
			cid := strings.TrimSpace(cr.CompanyID)
			if cid == "" {
				continue
			}
			var n int64
			if err := tx.Model(&models.UserTenantRole{}).
				Joins("INNER JOIN tenant_roles tr ON tr.id = user_tenant_roles.tenant_role_id AND tr.company_id = user_tenant_roles.company_id").
				Where("user_tenant_roles.user_id = ? AND user_tenant_roles.company_id = ? AND tr.slug = ?", uid, cid, rbac.TenantRoleSlugSystemAdmin).
				Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				continue
			}
			if err := tx.Transaction(func(inner *gorm.DB) error {
				rid, err := EnsureSystemTenantRole(inner, cid)
				if err != nil {
					return err
				}
				row := &models.UserTenantRole{
					UserID:       uid,
					CompanyID:    cid,
					TenantRoleID: rid,
				}
				if err := inner.Create(row).Error; err != nil {
					return err
				}
				return RebuildUserUnitsFromTenantRoles(inner, uid, cid)
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func BackfillSystemAdminUserUnits(tx *gorm.DB) error {
	type pair struct {
		UserID    string `gorm:"column:user_id"`
		CompanyID string `gorm:"column:company_id"`
	}
	var rows []pair
	if err := tx.Raw(`
SELECT DISTINCT utr.user_id, utr.company_id
FROM user_tenant_roles utr
INNER JOIN tenant_roles tr ON tr.id = utr.tenant_role_id AND tr.company_id = utr.company_id
WHERE tr.slug = ?
`, rbac.TenantRoleSlugSystemAdmin).Scan(&rows).Error; err != nil {
		return err
	}
	for _, r := range rows {
		if err := RebuildUserUnitsFromTenantRoles(tx, r.UserID, r.CompanyID); err != nil {
			return err
		}
	}
	return nil
}
