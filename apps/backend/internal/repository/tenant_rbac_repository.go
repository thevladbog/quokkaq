package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/tenantroleseed"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// TenantRBACRepository persists tenant-scoped roles and SSO group mappings.
type TenantRBACRepository interface {
	ListTenantRoles(companyID string) ([]models.TenantRole, error)
	GetTenantRole(companyID, roleID string) (*models.TenantRole, error)
	CreateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error
	UpdateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error
	DeleteTenantRole(companyID, roleID string) error

	ListGroupMappings(companyID string) ([]models.CompanySSOGroupMapping, error)
	UpsertGroupMapping(m *models.CompanySSOGroupMapping) error
	DeleteGroupMapping(companyID, mappingID string) error

	ReplaceUserTenantRoles(userID, companyID string, tenantRoleIDs []string) error
	ReplaceUserTenantRolesTx(tx *gorm.DB, userID, companyID string, tenantRoleIDs []string) error
	ListUserTenantRoleIDs(userID, companyID string) ([]string, error)
	// MapTenantRolesByUserForCompany returns tenant role rows (id, name, slug) per user id for the company.
	MapTenantRolesByUserForCompany(companyID string, userIDs []string) (map[string][]models.TenantRole, error)
	SyncUserUnitsFromTenantRoles(userID, companyID string) error
	SyncUserUnitsFromTenantRolesTx(tx *gorm.DB, userID, companyID string) error
	// EnsureSystemTenantRole creates the reserved system tenant role and TRU rows for all units.
	EnsureSystemTenantRole(companyID string) (roleID string, err error)
	EnsureSystemTenantRoleTx(tx *gorm.DB, companyID string) (roleID string, err error)
	EnsureSystemTenantRoleTRUForUnitTx(tx *gorm.DB, companyID, unitID string) error
	GetTenantRoleBySlug(companyID, slug string) (*models.TenantRole, error)
	FullTenantRoleUnitsForSystemRole(companyID, roleID string) ([]models.TenantRoleUnit, error)
	UserHasTenantSystemAdminRole(userID, companyID string) (bool, error)
	// UserHasTenantPermission is true if a tenant role grants the permission on the unit.
	UserHasTenantPermission(userID, companyID, unitID, permission string) (bool, error)
	// UserHasPermissionInCompany is true if the permission is granted on at least one unit in the company.
	UserHasPermissionInCompany(userID, companyID, permission string) (bool, error)
}

type tenantRBACRepository struct{}

func NewTenantRBACRepository() TenantRBACRepository {
	return &tenantRBACRepository{}
}

func (r *tenantRBACRepository) ListTenantRoles(companyID string) ([]models.TenantRole, error) {
	var rows []models.TenantRole
	err := database.DB.Where("company_id = ?", companyID).Preload("Units").Order("name").Find(&rows).Error
	return rows, err
}

func (r *tenantRBACRepository) GetTenantRole(companyID, roleID string) (*models.TenantRole, error) {
	var row models.TenantRole
	err := database.DB.Where("company_id = ? AND id = ?", companyID, roleID).Preload("Units").First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *tenantRBACRepository) CreateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(role).Error; err != nil {
			return err
		}
		for i := range units {
			units[i].TenantRoleID = role.ID
			if err := tx.Create(&units[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *tenantRBACRepository) UpdateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var cnt int64
		if err := tx.Model(&models.TenantRole{}).Where("id = ? AND company_id = ?", role.ID, role.CompanyID).Count(&cnt).Error; err != nil {
			return err
		}
		if cnt == 0 {
			return gorm.ErrRecordNotFound
		}
		if err := tx.Model(&models.TenantRole{}).Where("id = ? AND company_id = ?", role.ID, role.CompanyID).Updates(map[string]interface{}{
			"name":        role.Name,
			"slug":        role.Slug,
			"description": role.Description,
		}).Error; err != nil {
			return err
		}
		if err := tx.Where("tenant_role_id = ?", role.ID).Delete(&models.TenantRoleUnit{}).Error; err != nil {
			return err
		}
		for i := range units {
			units[i].TenantRoleID = role.ID
			if err := tx.Create(&units[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *tenantRBACRepository) DeleteTenantRole(companyID, roleID string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_role_id = ?", roleID).Delete(&models.UserTenantRole{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tenant_role_id = ?", roleID).Delete(&models.TenantRoleUnit{}).Error; err != nil {
			return err
		}
		return tx.Where("company_id = ? AND id = ?", companyID, roleID).Delete(&models.TenantRole{}).Error
	})
}

func (r *tenantRBACRepository) ListGroupMappings(companyID string) ([]models.CompanySSOGroupMapping, error) {
	var rows []models.CompanySSOGroupMapping
	err := database.DB.Where("company_id = ?", companyID).Order("idp_group_id").Find(&rows).Error
	return rows, err
}

func (r *tenantRBACRepository) UpsertGroupMapping(m *models.CompanySSOGroupMapping) error {
	var existing models.CompanySSOGroupMapping
	err := database.DB.Where("company_id = ? AND idp_group_id = ?", m.CompanyID, m.IdpGroupID).First(&existing).Error
	if err == nil {
		return database.DB.Model(&models.CompanySSOGroupMapping{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
			"tenant_role_id":   m.TenantRoleID,
			"legacy_role_name": m.LegacyRoleName,
		}).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return database.DB.Create(m).Error
}

func (r *tenantRBACRepository) DeleteGroupMapping(companyID, mappingID string) error {
	return database.DB.Where("company_id = ? AND id = ?", companyID, mappingID).Delete(&models.CompanySSOGroupMapping{}).Error
}

func (r *tenantRBACRepository) ReplaceUserTenantRoles(userID, companyID string, tenantRoleIDs []string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND company_id = ?", userID, companyID).Delete(&models.UserTenantRole{}).Error; err != nil {
			return err
		}
		for _, rid := range tenantRoleIDs {
			if rid == "" {
				continue
			}
			row := &models.UserTenantRole{
				UserID:       userID,
				CompanyID:    companyID,
				TenantRoleID: rid,
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *tenantRBACRepository) ListUserTenantRoleIDs(userID, companyID string) ([]string, error) {
	var ids []string
	err := database.DB.Model(&models.UserTenantRole{}).
		Where("user_id = ? AND company_id = ?", userID, companyID).
		Pluck("tenant_role_id", &ids).Error
	return ids, err
}

func (r *tenantRBACRepository) MapTenantRolesByUserForCompany(companyID string, userIDs []string) (map[string][]models.TenantRole, error) {
	out := make(map[string][]models.TenantRole)
	if len(userIDs) == 0 {
		return out, nil
	}
	var rows []models.UserTenantRole
	err := database.DB.Where("company_id = ? AND user_id IN ?", companyID, userIDs).
		Preload("TenantRole").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	for i := range rows {
		row := rows[i]
		tr := row.TenantRole
		if tr.ID == "" {
			continue
		}
		out[row.UserID] = append(out[row.UserID], tr)
	}
	return out, nil
}

// SyncUserUnitsFromTenantRoles rebuilds user_units rows for all units in the company from tenant role grants.
func (r *tenantRBACRepository) SyncUserUnitsFromTenantRoles(userID, companyID string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		return tenantroleseed.RebuildUserUnitsFromTenantRoles(tx, userID, companyID)
	})
}

func (r *tenantRBACRepository) SyncUserUnitsFromTenantRolesTx(tx *gorm.DB, userID, companyID string) error {
	return tenantroleseed.RebuildUserUnitsFromTenantRoles(tx, userID, companyID)
}

func (r *tenantRBACRepository) EnsureSystemTenantRole(companyID string) (string, error) {
	var roleID string
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		rid, err := tenantroleseed.EnsureSystemTenantRole(tx, companyID)
		if err != nil {
			return err
		}
		roleID = rid
		return nil
	})
	return roleID, err
}

func (r *tenantRBACRepository) EnsureSystemTenantRoleTx(tx *gorm.DB, companyID string) (string, error) {
	return tenantroleseed.EnsureSystemTenantRole(tx, companyID)
}

func (r *tenantRBACRepository) EnsureSystemTenantRoleTRUForUnitTx(tx *gorm.DB, companyID, unitID string) error {
	return tenantroleseed.EnsureSystemTenantRoleTRUForUnit(tx, companyID, unitID)
}

func (r *tenantRBACRepository) GetTenantRoleBySlug(companyID, slug string) (*models.TenantRole, error) {
	var row models.TenantRole
	err := database.DB.Where("company_id = ? AND slug = ?", companyID, strings.TrimSpace(slug)).Preload("Units").First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *tenantRBACRepository) FullTenantRoleUnitsForSystemRole(companyID, roleID string) ([]models.TenantRoleUnit, error) {
	var unitIDs []string
	if err := database.DB.Model(&models.Unit{}).Where("company_id = ?", companyID).Pluck("id", &unitIDs).Error; err != nil {
		return nil, err
	}
	perms := tenantroleseed.AllPermissionsStringArray()
	out := make([]models.TenantRoleUnit, 0, len(unitIDs))
	for _, uid := range unitIDs {
		out = append(out, models.TenantRoleUnit{TenantRoleID: roleID, UnitID: uid, Permissions: perms})
	}
	return out, nil
}

func (r *tenantRBACRepository) UserHasTenantSystemAdminRole(userID, companyID string) (bool, error) {
	var n int64
	err := database.DB.Model(&models.UserTenantRole{}).
		Joins("INNER JOIN tenant_roles tr ON tr.id = user_tenant_roles.tenant_role_id").
		Where("user_tenant_roles.user_id = ? AND user_tenant_roles.company_id = ? AND tr.slug = ?", userID, companyID, "system_admin").
		Count(&n).Error
	return n > 0, err
}

func (r *tenantRBACRepository) ReplaceUserTenantRolesTx(tx *gorm.DB, userID, companyID string, tenantRoleIDs []string) error {
	if err := tx.Where("user_id = ? AND company_id = ?", userID, companyID).Delete(&models.UserTenantRole{}).Error; err != nil {
		return err
	}
	for _, rid := range tenantRoleIDs {
		if rid == "" {
			continue
		}
		row := &models.UserTenantRole{
			UserID:       userID,
			CompanyID:    companyID,
			TenantRoleID: rid,
		}
		if err := tx.Create(row).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *tenantRBACRepository) UserHasTenantPermission(userID, companyID, unitID, permission string) (bool, error) {
	permission = strings.TrimSpace(permission)
	if permission == "" {
		return false, nil
	}
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(1) FROM user_tenant_roles utr
		INNER JOIN tenant_role_units tru ON tru.tenant_role_id = utr.tenant_role_id
		WHERE utr.user_id = ? AND utr.company_id = ?
		  AND tru.unit_id = ?
		  AND ? = ANY(COALESCE(tru.permissions, '{}'::text[]))
	`, userID, companyID, unitID, permission).Scan(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *tenantRBACRepository) UserHasPermissionInCompany(userID, companyID, permission string) (bool, error) {
	permission = strings.TrimSpace(permission)
	if permission == "" {
		return false, nil
	}
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(1) FROM user_tenant_roles utr
		INNER JOIN tenant_role_units tru ON tru.tenant_role_id = utr.tenant_role_id
		WHERE utr.user_id = ? AND utr.company_id = ?
		  AND ? = ANY(COALESCE(tru.permissions, '{}'::text[]))
	`, userID, companyID, permission).Scan(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
