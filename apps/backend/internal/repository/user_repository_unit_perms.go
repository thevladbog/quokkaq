package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/rbac"

	"gorm.io/gorm"
)

// UserHasUnitPermissionInCompany is true if user_units.permissions grants the canonical permission
// (or a legacy alias) on any unit belonging to the company.
func (r *userRepository) UserHasUnitPermissionInCompany(userID, companyID, canonicalPerm string) (bool, error) {
	userID, companyID = strings.TrimSpace(userID), strings.TrimSpace(companyID)
	if userID == "" || companyID == "" || strings.TrimSpace(canonicalPerm) == "" {
		return false, nil
	}
	variants := rbac.CanonicalPermissionVariants(canonicalPerm)
	if len(variants) == 0 {
		return false, nil
	}
	var rows []models.UserUnit
	err := r.db.Model(&models.UserUnit{}).
		Joins("INNER JOIN units ON units.id = user_units.unit_id AND units.company_id = ?", companyID).
		Where("user_units.user_id = ?", userID).
		Find(&rows).Error
	if err != nil {
		return false, err
	}
	for _, uu := range rows {
		for _, stored := range uu.Permissions {
			stored = strings.TrimSpace(stored)
			for _, v := range variants {
				if stored == v {
					return true, nil
				}
			}
		}
	}
	return false, nil
}

// UserMatchesUnitPermission is true if user_units.permissions for this unit contains the canonical
// permission or any legacy alias (see rbac.CanonicalPermissionVariants).
func (r *userRepository) UserMatchesUnitPermission(userID, unitID, canonicalPerm string) (bool, error) {
	userID, unitID = strings.TrimSpace(userID), strings.TrimSpace(unitID)
	if userID == "" || unitID == "" || strings.TrimSpace(canonicalPerm) == "" {
		return false, nil
	}
	var uu models.UserUnit
	err := r.db.Where("user_id = ? AND unit_id = ?", userID, unitID).First(&uu).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	variants := rbac.CanonicalPermissionVariants(canonicalPerm)
	for _, stored := range uu.Permissions {
		stored = strings.TrimSpace(stored)
		for _, v := range variants {
			if stored == v {
				return true, nil
			}
		}
	}
	return false, nil
}

// UserMatchesAnyUnitPermission is true if any canonical permission matches user_units for the unit.
func (r *userRepository) UserMatchesAnyUnitPermission(userID, unitID string, canonicalPerms []string) (bool, error) {
	for _, p := range canonicalPerms {
		ok, err := r.UserMatchesUnitPermission(userID, unitID, p)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}
