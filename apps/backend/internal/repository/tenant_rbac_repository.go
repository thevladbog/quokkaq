package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/tenantroleseed"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// TenantRBACRepository persists tenant-scoped roles and SSO group mappings.
type TenantRBACRepository interface {
	ListTenantRoles(companyID string) ([]models.TenantRole, error)
	GetTenantRole(companyID, roleID string) (*models.TenantRole, error)
	// ListTenantRolesByIDs returns tenant roles for the company whose ids appear in roleIDs (empty slice → nil, nil).
	ListTenantRolesByIDs(companyID string, roleIDs []string) ([]models.TenantRole, error)
	CreateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error
	UpdateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error
	DeleteTenantRole(companyID, roleID string) error

	ListGroupMappings(ctx context.Context, companyID string) ([]models.CompanySSOGroupMapping, error)
	// UpsertGroupMapping creates or updates a mapping by (companyId, idpGroupId). The second return is true when a new row was inserted.
	UpsertGroupMapping(m *models.CompanySSOGroupMapping) (*models.CompanySSOGroupMapping, bool, error)
	DeleteGroupMapping(companyID, mappingID string) error

	// ReplaceUserTenantRoles replaces user_tenant_roles for the user in the company. If tenantRoleIDs is empty after trimming,
	// allowEmpty must be true (e.g. explicit admin deprovision or SSO reconciliation); otherwise ErrEmptyTenantRoleAssignmentNotAllowed.
	ReplaceUserTenantRoles(userID, companyID string, tenantRoleIDs []string, allowEmpty bool) error
	ReplaceUserTenantRolesTx(tx *gorm.DB, userID, companyID string, tenantRoleIDs []string, allowEmpty bool) error
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

// validateTenantRoleUnitsCompanyScope loads units for the given TenantRoleUnit rows within tx
// and ensures each unit exists and Unit.CompanyID matches companyID.
func validateTenantRoleUnitsCompanyScope(tx *gorm.DB, companyID string, units []models.TenantRoleUnit) error {
	if len(units) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	ids := make([]string, 0, len(units))
	for i := range units {
		id := strings.TrimSpace(units[i].UnitID)
		if id == "" {
			return errors.New("tenant role unit: empty unit id")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	var loaded []models.Unit
	if err := tx.Select("id", "company_id").Where("id IN ?", ids).Find(&loaded).Error; err != nil {
		return err
	}
	if len(loaded) != len(ids) {
		return errors.New("tenant role unit: one or more units not found")
	}
	byID := make(map[string]string, len(loaded))
	for i := range loaded {
		byID[loaded[i].ID] = loaded[i].CompanyID
	}
	for _, id := range ids {
		if cid, ok := byID[id]; !ok || cid != companyID {
			return fmt.Errorf("tenant role unit: unit %q is not in company %q", id, companyID)
		}
	}
	return nil
}

func effectiveTenantRoleIDs(tenantRoleIDs []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(tenantRoleIDs))
	for _, rid := range tenantRoleIDs {
		rid = strings.TrimSpace(rid)
		if rid == "" {
			continue
		}
		if _, ok := seen[rid]; ok {
			continue
		}
		seen[rid] = struct{}{}
		out = append(out, rid)
	}
	return out
}

func (r *tenantRBACRepository) replaceUserTenantRolesTx(tx *gorm.DB, userID, companyID string, tenantRoleIDs []string, allowEmpty bool) error {
	effective := effectiveTenantRoleIDs(tenantRoleIDs)
	if len(effective) == 0 && !allowEmpty {
		return ErrEmptyTenantRoleAssignmentNotAllowed
	}
	for _, rid := range effective {
		if err := ensureTenantRoleInCompany(tx, companyID, rid); err != nil {
			return err
		}
	}
	if err := tx.Where("user_id = ? AND company_id = ?", userID, companyID).Delete(&models.UserTenantRole{}).Error; err != nil {
		return err
	}
	for _, rid := range effective {
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

// userIDsAssignedToTenantRole returns distinct users who have the tenant role in the company (same tx snapshot).
func userIDsAssignedToTenantRole(tx *gorm.DB, companyID, tenantRoleID string) ([]string, error) {
	var ids []string
	err := tx.Model(&models.UserTenantRole{}).
		Where("company_id = ? AND tenant_role_id = ?", companyID, tenantRoleID).
		Pluck("user_id", &ids).Error
	return ids, err
}

// resyncUserUnitsForUsers runs RebuildUserUnitsFromTenantRoles for each user in the company (aggregates all their tenant_role_units).
func resyncUserUnitsForUsers(tx *gorm.DB, companyID string, userIDs []string) error {
	for _, uid := range userIDs {
		if err := tenantroleseed.RebuildUserUnitsFromTenantRoles(tx, uid, companyID); err != nil {
			return err
		}
	}
	return nil
}

// ensureTenantRoleInCompany returns ErrTenantRoleNotInCompany when no tenant_roles row exists with id and company_id.
func ensureTenantRoleInCompany(db *gorm.DB, companyID, tenantRoleID string) error {
	tenantRoleID = strings.TrimSpace(tenantRoleID)
	if tenantRoleID == "" {
		return nil
	}
	var n int64
	if err := db.Model(&models.TenantRole{}).Where("id = ? AND company_id = ?", tenantRoleID, companyID).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return ErrTenantRoleNotInCompany
	}
	return nil
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

func (r *tenantRBACRepository) ListTenantRolesByIDs(companyID string, roleIDs []string) ([]models.TenantRole, error) {
	if len(roleIDs) == 0 {
		return nil, nil
	}
	var rows []models.TenantRole
	err := database.DB.Where("company_id = ? AND id IN ?", companyID, roleIDs).Preload("Units").Find(&rows).Error
	return rows, err
}

func (r *tenantRBACRepository) CreateTenantRole(role *models.TenantRole, units []models.TenantRoleUnit) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := validateTenantRoleUnitsCompanyScope(tx, role.CompanyID, units); err != nil {
			return err
		}
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
		if err := validateTenantRoleUnitsCompanyScope(tx, role.CompanyID, units); err != nil {
			return err
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
		uids, err := userIDsAssignedToTenantRole(tx, role.CompanyID, role.ID)
		if err != nil {
			return err
		}
		return resyncUserUnitsForUsers(tx, role.CompanyID, uids)
	})
}

func (r *tenantRBACRepository) DeleteTenantRole(companyID, roleID string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		uids, err := userIDsAssignedToTenantRole(tx, companyID, roleID)
		if err != nil {
			return err
		}
		if err := tx.Where("tenant_role_id = ?", roleID).Delete(&models.UserTenantRole{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tenant_role_id = ?", roleID).Delete(&models.TenantRoleUnit{}).Error; err != nil {
			return err
		}
		if err := tx.Where("company_id = ? AND id = ?", companyID, roleID).Delete(&models.TenantRole{}).Error; err != nil {
			return err
		}
		return resyncUserUnitsForUsers(tx, companyID, uids)
	})
}

func (r *tenantRBACRepository) ListGroupMappings(ctx context.Context, companyID string) ([]models.CompanySSOGroupMapping, error) {
	var rows []models.CompanySSOGroupMapping
	err := database.DB.WithContext(ctx).Where("company_id = ?", companyID).Order("idp_group_id").Find(&rows).Error
	return rows, err
}

func (r *tenantRBACRepository) UpsertGroupMapping(m *models.CompanySSOGroupMapping) (*models.CompanySSOGroupMapping, bool, error) {
	if m.TenantRoleID != nil && strings.TrimSpace(*m.TenantRoleID) != "" {
		if err := ensureTenantRoleInCompany(database.DB, m.CompanyID, *m.TenantRoleID); err != nil {
			return nil, false, err
		}
	}
	var existing models.CompanySSOGroupMapping
	err := database.DB.Where("company_id = ? AND idp_group_id = ?", m.CompanyID, m.IdpGroupID).First(&existing).Error
	if err == nil {
		if err := database.DB.Model(&models.CompanySSOGroupMapping{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
			"tenant_role_id":   m.TenantRoleID,
			"legacy_role_name": m.LegacyRoleName,
			"updated_at":       time.Now(),
		}).Error; err != nil {
			return nil, false, err
		}
		var out models.CompanySSOGroupMapping
		if err := database.DB.Where("id = ?", existing.ID).First(&out).Error; err != nil {
			return nil, false, err
		}
		return &out, false, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, err
	}
	if err := database.DB.Create(m).Error; err != nil {
		return nil, false, err
	}
	return m, true, nil
}

func (r *tenantRBACRepository) DeleteGroupMapping(companyID, mappingID string) error {
	return database.DB.Where("company_id = ? AND id = ?", companyID, mappingID).Delete(&models.CompanySSOGroupMapping{}).Error
}

func (r *tenantRBACRepository) ReplaceUserTenantRoles(userID, companyID string, tenantRoleIDs []string, allowEmpty bool) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		return r.replaceUserTenantRolesTx(tx, userID, companyID, tenantRoleIDs, allowEmpty)
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
		Joins("INNER JOIN tenant_roles tr ON tr.id = user_tenant_roles.tenant_role_id AND tr.company_id = user_tenant_roles.company_id").
		Where("user_tenant_roles.user_id = ? AND user_tenant_roles.company_id = ? AND tr.slug = ?", userID, companyID, "system_admin").
		Count(&n).Error
	return n > 0, err
}

func (r *tenantRBACRepository) ReplaceUserTenantRolesTx(tx *gorm.DB, userID, companyID string, tenantRoleIDs []string, allowEmpty bool) error {
	return r.replaceUserTenantRolesTx(tx, userID, companyID, tenantRoleIDs, allowEmpty)
}

func (r *tenantRBACRepository) UserHasTenantPermission(userID, companyID, unitID, permission string) (bool, error) {
	permission = strings.TrimSpace(permission)
	if permission == "" {
		return false, nil
	}
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(1) FROM user_tenant_roles utr
		INNER JOIN tenant_roles tr ON tr.id = utr.tenant_role_id AND tr.company_id = utr.company_id
		INNER JOIN tenant_role_units tru ON tru.tenant_role_id = utr.tenant_role_id
		INNER JOIN units u ON u.id = tru.unit_id AND u.company_id = utr.company_id
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
		INNER JOIN tenant_roles tr ON tr.id = utr.tenant_role_id AND tr.company_id = utr.company_id
		INNER JOIN tenant_role_units tru ON tru.tenant_role_id = utr.tenant_role_id
		INNER JOIN units u ON u.id = tru.unit_id AND u.company_id = utr.company_id
		WHERE utr.user_id = ? AND utr.company_id = ?
		  AND ? = ANY(COALESCE(tru.permissions, '{}'::text[]))
	`, userID, companyID, permission).Scan(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
