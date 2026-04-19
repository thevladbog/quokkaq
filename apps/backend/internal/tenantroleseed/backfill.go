package tenantroleseed

import (
	"strings"

	"quokkaq-go-backend/internal/models"

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
