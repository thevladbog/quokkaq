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
