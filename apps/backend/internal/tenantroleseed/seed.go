// Package tenantroleseed creates the reserved system tenant role and TRU rows without importing pkg/database
// (avoids an import cycle with repository).
package tenantroleseed

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	"gorm.io/gorm"
)

func upsertTRU(tx *gorm.DB, roleID, unitID string, perms models.StringArray) error {
	var tru models.TenantRoleUnit
	err := tx.Where("tenant_role_id = ? AND unit_id = ?", roleID, unitID).First(&tru).Error
	if err == nil {
		return tx.Model(&tru).Update("permissions", perms).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	tru = models.TenantRoleUnit{TenantRoleID: roleID, UnitID: unitID, Permissions: perms}
	return tx.Create(&tru).Error
}

func ensureSystemTenantRoleRow(tx *gorm.DB, companyID string) (*models.TenantRole, error) {
	var existing models.TenantRole
	err := tx.Where("company_id = ? AND slug = ?", companyID, rbac.TenantRoleSlugSystemAdmin).First(&existing).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	role := &models.TenantRole{
		CompanyID:   companyID,
		Name:        rbac.SystemTenantRoleNameEN,
		Slug:        rbac.TenantRoleSlugSystemAdmin,
		Description: "Full access within the organization",
	}
	if err := tx.Create(role).Error; err != nil {
		return nil, err
	}
	return role, nil
}

// EnsureSystemTenantRole creates the system role if missing and upserts TRU rows for every unit with rbac.All().
func EnsureSystemTenantRole(tx *gorm.DB, companyID string) (roleID string, err error) {
	role, err := ensureSystemTenantRoleRow(tx, companyID)
	if err != nil {
		return "", err
	}
	perms := AllPermissionsStringArray()
	var unitIDs []string
	if err := tx.Model(&models.Unit{}).Where("company_id = ?", companyID).Pluck("id", &unitIDs).Error; err != nil {
		return "", err
	}
	for _, uid := range unitIDs {
		if err := upsertTRU(tx, role.ID, uid, perms); err != nil {
			return "", err
		}
	}
	return role.ID, nil
}

// EnsureSystemTenantRoleTRUForUnit ensures the system role exists and has a full-permission TRU row for the unit.
func EnsureSystemTenantRoleTRUForUnit(tx *gorm.DB, companyID, unitID string) error {
	role, err := ensureSystemTenantRoleRow(tx, companyID)
	if err != nil {
		return err
	}
	return upsertTRU(tx, role.ID, unitID, AllPermissionsStringArray())
}

// AllPermissionsStringArray returns the full permission catalog as a DB string array (same as rbac.All).
func AllPermissionsStringArray() models.StringArray {
	return models.StringArray(rbac.All())
}

// RebuildUserUnitsFromTenantRoles replaces user_units for the user in the company from tenant_role_units (same logic as repository).
func RebuildUserUnitsFromTenantRoles(tx *gorm.DB, userID, companyID string) error {
	var unitIDs []string
	if err := tx.Model(&models.Unit{}).Where("company_id = ?", companyID).Pluck("id", &unitIDs).Error; err != nil {
		return err
	}
	if len(unitIDs) == 0 {
		return nil
	}
	var utr []models.UserTenantRole
	if err := tx.Where("user_id = ? AND company_id = ?", userID, companyID).Find(&utr).Error; err != nil {
		return err
	}
	if len(utr) == 0 {
		return tx.Where("user_id = ? AND unit_id IN ?", userID, unitIDs).Delete(&models.UserUnit{}).Error
	}
	roleIDs := make([]string, 0, len(utr))
	for i := range utr {
		roleIDs = append(roleIDs, utr[i].TenantRoleID)
	}
	var trus []models.TenantRoleUnit
	if err := tx.Where("tenant_role_id IN ?", roleIDs).Find(&trus).Error; err != nil {
		return err
	}
	permByUnit := make(map[string]map[string]struct{})
	for _, tru := range trus {
		m, ok := permByUnit[tru.UnitID]
		if !ok {
			m = make(map[string]struct{})
			permByUnit[tru.UnitID] = m
		}
		for _, p := range tru.Permissions {
			p = strings.TrimSpace(p)
			if p != "" {
				m[p] = struct{}{}
			}
		}
	}
	if err := tx.Where("user_id = ? AND unit_id IN ?", userID, unitIDs).Delete(&models.UserUnit{}).Error; err != nil {
		return err
	}
	for _, uid := range unitIDs {
		m := permByUnit[uid]
		if len(m) == 0 {
			continue
		}
		perms := make([]string, 0, len(m))
		for p := range m {
			perms = append(perms, p)
		}
		uu := &models.UserUnit{
			UserID:      userID,
			UnitID:      uid,
			Permissions: models.StringArray(perms),
		}
		if err := tx.Create(uu).Error; err != nil {
			return err
		}
	}
	return nil
}
