package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// UserUnitResult is the first user_units row joined to units for a user.
type UserUnitResult struct {
	UnitID    string
	CompanyID string
}

type UserRepository interface {
	Create(user *models.User) error
	CreateTx(tx *gorm.DB, user *models.User) error
	FindAll(search string) ([]models.User, error)
	FindByID(id string) (*models.User, error)
	FindByIDTx(tx *gorm.DB, id string) (*models.User, error)
	FindByEmail(email string) (*models.User, error)
	Update(user *models.User) error
	UpdateTx(tx *gorm.DB, user *models.User) error
	Delete(id string) error
	AssignUnit(userID, unitID string, permissions []string) error
	CreateUserUnitTx(tx *gorm.DB, uu *models.UserUnit) error
	RemoveUnit(userID, unitID string) error
	AssignRole(userID, roleID string) error
	AssignRoleTx(tx *gorm.DB, userID, roleID string) error
	RemoveUserRoleByName(userID, roleName string) error
	RemoveUserRoleByNameTx(tx *gorm.DB, userID, roleName string) error
	FindRoleByName(name string) (*models.Role, error)
	CreatePasswordResetToken(token *models.PasswordResetToken) error
	FindPasswordResetToken(token string) (*models.PasswordResetToken, error)
	DeletePasswordResetToken(id string) error
	Count() (int64, error)
	EnsureRoleExists(name string) (*models.Role, error)
	EnsureRoleExistsTx(tx *gorm.DB, name string) (*models.Role, error)
	IsAdmin(userID string) (bool, error)
	// ListUserIDsByRoleNames returns distinct user ids that have at least one of the given role names.
	ListUserIDsByRoleNames(roleNames []string) ([]string, error)
	// HasSupportReportAccess is true for roles that may use /support/reports (admin, staff, supervisor, operator).
	HasSupportReportAccess(userID string) (bool, error)
	IsPlatformAdmin(userID string) (bool, error)
	IsAdminOrHasUnitAccess(userID, unitID string) (bool, error)
	HasCompanyAccess(userID, companyID string) (bool, error)
	IsCompanyOwner(userID, companyID string) (bool, error)
	// GetCompanyIDByUserID returns company_id from the user's first assigned unit (user_units → units).
	GetCompanyIDByUserID(userID string) (companyID string, err error)
	// ResolveCompanyIDForRequest uses X-Company-Id when present and allowed; otherwise GetCompanyIDByUserID.
	ResolveCompanyIDForRequest(userID string, headerCompanyID string) (companyID string, err error)
	// ListAccessibleCompanies returns tenants the user may access (units + ownership), optional search q.
	ListAccessibleCompanies(userID string, q string) ([]AccessibleCompanySummary, error)
	// GetFirstUserUnit returns the first user_units row joined to units for the user (same shape as legacy usage handler query).
	GetFirstUserUnit(userID string) (UserUnitResult, error)
	// ListSupportReportShareCandidates lists users in the same company with support roles (admin, staff, supervisor, operator), matching name/email.
	// reportID and authorUserID exclude users who already have access as author or an existing share row.
	ListSupportReportShareCandidates(companyID, reportID, authorUserID, q string, limit int) ([]SupportReportShareCandidate, error)
	// ResolveJournalActorDisplayNames returns a display label per user id (non-empty trimmed name, else email). Omitted ids are not in the map.
	ResolveJournalActorDisplayNames(userIDs []string) (map[string]string, error)
	// ShiftJournalSeesAllActivity is true when the user may list all ticket history in the unit (not restricted to own actions).
	ShiftJournalSeesAllActivity(userID, unitID string) (bool, error)
	// HasUnitBranchAccess is true for tenant admin, or if the user has any user_units row for the subdivision or a descendant unit in the org tree.
	HasUnitBranchAccess(userID, subdivisionID string) (bool, error)
}

type userRepository struct {
	db *gorm.DB
}

func NewUserRepository() UserRepository {
	return &userRepository{db: database.DB}
}

func (r *userRepository) Create(user *models.User) error {
	return r.db.Create(user).Error
}

func (r *userRepository) CreateTx(tx *gorm.DB, user *models.User) error {
	return tx.Create(user).Error
}

func (r *userRepository) FindAll(search string) ([]models.User, error) {
	var users []models.User
	query := r.db.Preload("Roles.Role").Preload("Units.Unit").Preload("Units")

	if search != "" {
		searchTerm := "%" + search + "%"
		query = query.Where("name ILIKE ? OR email ILIKE ?", searchTerm, searchTerm)
	}

	err := query.Find(&users).Error
	return users, err
}

func (r *userRepository) FindByID(id string) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Role").Preload("Units.Unit").Preload("Units").First(&user, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) FindByIDTx(tx *gorm.DB, id string) (*models.User, error) {
	var user models.User
	err := tx.Preload("Roles.Role").Preload("Units.Unit").Preload("Units").First(&user, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Role").Preload("Units.Unit").Preload("Units").First(&user, "email = ?", email).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) Update(user *models.User) error {
	return r.UpdateTx(r.db, user)
}

func (r *userRepository) UpdateTx(tx *gorm.DB, user *models.User) error {
	updates := map[string]interface{}{
		"name":      user.Name,
		"email":     user.Email,
		"phone":     user.Phone,
		"is_active": user.IsActive,
		"type":      user.Type,
		"photo_url": user.PhotoURL,
	}
	if user.Password != nil {
		updates["password"] = user.Password
	}
	return tx.Model(&models.User{}).Where("id = ?", user.ID).Updates(updates).Error
}

func (r *userRepository) Delete(id string) error {
	return r.db.Delete(&models.User{}, "id = ?", id).Error
}

func (r *userRepository) AssignUnit(userID, unitID string, permissions []string) error {
	uu := models.UserUnit{
		UserID:      userID,
		UnitID:      unitID,
		Permissions: models.StringArray(permissions),
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "unit_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"permissions"}),
	}).Create(&uu).Error
}

func (r *userRepository) CreateUserUnitTx(tx *gorm.DB, uu *models.UserUnit) error {
	return tx.Create(uu).Error
}

func (r *userRepository) AssignRole(userID, roleID string) error {
	userRole := models.UserRole{
		UserID: userID,
		RoleID: roleID,
	}
	return r.db.Create(&userRole).Error
}

func (r *userRepository) AssignRoleTx(tx *gorm.DB, userID, roleID string) error {
	userRole := models.UserRole{
		UserID: userID,
		RoleID: roleID,
	}
	return tx.Create(&userRole).Error
}

func (r *userRepository) RemoveUserRoleByName(userID, roleName string) error {
	return r.RemoveUserRoleByNameTx(r.db, userID, roleName)
}

func (r *userRepository) RemoveUserRoleByNameTx(tx *gorm.DB, userID, roleName string) error {
	return tx.Exec(`
		DELETE FROM user_roles ur
		USING roles r
		WHERE ur.role_id = r.id AND ur.user_id = ? AND r.name = ?
	`, userID, roleName).Error
}

func (r *userRepository) FindRoleByName(name string) (*models.Role, error) {
	var role models.Role
	err := r.db.First(&role, "name = ?", name).Error
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *userRepository) RemoveUnit(userID, unitID string) error {
	return r.db.Delete(&models.UserUnit{}, "user_id = ? AND unit_id = ?", userID, unitID).Error
}

func (r *userRepository) CreatePasswordResetToken(token *models.PasswordResetToken) error {
	return r.db.Create(token).Error
}

func (r *userRepository) FindPasswordResetToken(token string) (*models.PasswordResetToken, error) {
	var resetToken models.PasswordResetToken
	err := r.db.Preload("User").First(&resetToken, "token = ?", token).Error
	if err != nil {
		return nil, err
	}
	return &resetToken, nil
}

func (r *userRepository) DeletePasswordResetToken(id string) error {
	return r.db.Delete(&models.PasswordResetToken{}, "id = ?", id).Error
}

func (r *userRepository) Count() (int64, error) {
	var count int64
	err := r.db.Model(&models.User{}).Count(&count).Error
	return count, err
}

func (r *userRepository) EnsureRoleExists(name string) (*models.Role, error) {
	var role models.Role
	err := r.db.FirstOrCreate(&role, models.Role{Name: name}).Error
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *userRepository) EnsureRoleExistsTx(tx *gorm.DB, name string) (*models.Role, error) {
	var role models.Role
	err := tx.FirstOrCreate(&role, models.Role{Name: name}).Error
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *userRepository) IsAdmin(userID string) (bool, error) {
	user, err := r.FindByID(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	for _, ur := range user.Roles {
		if ur.Role.Name == "admin" {
			return true, nil
		}
	}
	return false, nil
}

func (r *userRepository) ListUserIDsByRoleNames(roleNames []string) ([]string, error) {
	if len(roleNames) == 0 {
		return nil, nil
	}
	var ids []string
	err := r.db.Model(&models.User{}).
		Select("DISTINCT users.id").
		Joins("JOIN user_roles ON user_roles.user_id = users.id").
		Joins("JOIN roles ON roles.id = user_roles.role_id").
		Where("roles.name IN ?", roleNames).
		Order("users.id").
		Pluck("users.id", &ids).Error
	return ids, err
}

func (r *userRepository) HasSupportReportAccess(userID string) (bool, error) {
	user, err := r.FindByID(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	for _, ur := range user.Roles {
		switch ur.Role.Name {
		case "admin", "staff", "supervisor", "operator":
			return true, nil
		}
	}
	return false, nil
}

func (r *userRepository) IsPlatformAdmin(userID string) (bool, error) {
	user, err := r.FindByID(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	for _, ur := range user.Roles {
		if ur.Role.Name == "platform_admin" {
			return true, nil
		}
	}
	return false, nil
}

func (r *userRepository) IsAdminOrHasUnitAccess(userID, unitID string) (bool, error) {
	if unitID == "" {
		return false, nil
	}
	user, err := r.FindByID(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	for _, ur := range user.Roles {
		if ur.Role.Name == "admin" || ur.Role.Name == "platform_admin" {
			return true, nil
		}
	}
	for _, uu := range user.Units {
		if uu.UnitID == unitID {
			return true, nil
		}
	}
	return false, nil
}

// HasCompanyAccess checks if user has access to any unit within a company
func (r *userRepository) HasCompanyAccess(userID, companyID string) (bool, error) {
	if companyID == "" {
		return false, nil
	}

	// Check if user is admin (admins have access to all companies)
	isAdmin, err := r.IsAdmin(userID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	isOwner, err := r.IsCompanyOwner(userID, companyID)
	if err != nil {
		return false, err
	}
	if isOwner {
		return true, nil
	}

	// Check if user has access to any unit belonging to this company
	var count int64
	err = r.db.Table("user_units").
		Joins("INNER JOIN units ON units.id = user_units.unit_id").
		Where("user_units.user_id = ? AND units.company_id = ?", userID, companyID).
		Count(&count).Error

	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// IsCompanyOwner checks if user is the owner of the company
func (r *userRepository) IsCompanyOwner(userID, companyID string) (bool, error) {
	if companyID == "" || userID == "" {
		return false, nil
	}

	var company models.Company
	err := r.db.Where("id = ? AND owner_user_id = ?", companyID, userID).First(&company).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

func (r *userRepository) GetCompanyIDByUserID(userID string) (string, error) {
	// Use Raw+Scan: GORM's Table(...).First(&{CompanyID}) maps CompanyID to user_units.company_id,
	// which does not exist — only units.company_id is valid after the join.
	var companyID string
	err := r.db.Raw(`
		SELECT u.company_id
		FROM user_units uu
		INNER JOIN units u ON u.id = uu.unit_id
		WHERE uu.user_id = ?
		ORDER BY uu.id ASC
		LIMIT 1
	`, userID).Scan(&companyID).Error
	if err != nil {
		return "", err
	}
	if companyID == "" {
		return "", gorm.ErrRecordNotFound
	}
	return companyID, nil
}

func (r *userRepository) GetFirstUserUnit(userID string) (UserUnitResult, error) {
	var res UserUnitResult
	err := r.db.Raw(`
		SELECT uu.unit_id, u.company_id
		FROM user_units uu
		LEFT JOIN units u ON u.id = uu.unit_id
		WHERE uu.user_id = ?
		ORDER BY uu.id ASC
		LIMIT 1
	`, userID).Scan(&res).Error
	if err != nil {
		return UserUnitResult{}, err
	}
	if res.UnitID == "" {
		return UserUnitResult{}, gorm.ErrRecordNotFound
	}
	return res, nil
}

func (r *userRepository) ResolveJournalActorDisplayNames(userIDs []string) (map[string]string, error) {
	seen := make(map[string]struct{}, len(userIDs))
	unique := make([]string, 0, len(userIDs))
	for _, raw := range userIDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return map[string]string{}, nil
	}
	var users []models.User
	if err := r.db.Select("id", "name", "email").Where("id IN ?", unique).Find(&users).Error; err != nil {
		return nil, err
	}
	out := make(map[string]string, len(users))
	for i := range users {
		u := users[i]
		label := strings.TrimSpace(u.Name)
		if label == "" && u.Email != nil {
			label = strings.TrimSpace(*u.Email)
		}
		if label != "" {
			out[u.ID] = label
		}
	}
	return out, nil
}

func (r *userRepository) ShiftJournalSeesAllActivity(userID, unitID string) (bool, error) {
	if userID == "" || unitID == "" {
		return false, nil
	}
	user, err := r.FindByID(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	return shiftJournalSeesAllActivityFromLoadedUser(user, unitID), nil
}

func (r *userRepository) HasUnitBranchAccess(userID, subdivisionID string) (bool, error) {
	if userID == "" || subdivisionID == "" {
		return false, nil
	}
	ok, err := r.IsAdminOrHasUnitAccess(userID, subdivisionID)
	if err != nil || ok {
		return ok, err
	}
	var n int64
	err = r.db.Raw(`
WITH RECURSIVE branch AS (
  SELECT id FROM units WHERE id = ?
  UNION ALL
  SELECT u.id FROM units u INNER JOIN branch b ON u.parent_id = b.id
)
SELECT COUNT(*) FROM user_units uu
WHERE uu.user_id = ? AND uu.unit_id IN (SELECT id FROM branch)
`, subdivisionID, userID).Scan(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func escapeSQLLikePattern(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `%`, `\%`)
	s = strings.ReplaceAll(s, `_`, `\_`)
	return s
}

func (r *userRepository) ListSupportReportShareCandidates(companyID, reportID, authorUserID, q string, limit int) ([]SupportReportShareCandidate, error) {
	if strings.TrimSpace(companyID) == "" {
		return nil, nil
	}
	q = strings.TrimSpace(q)
	if len(q) < 2 {
		return []SupportReportShareCandidate{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	term := "%" + escapeSQLLikePattern(q) + "%"
	var out []SupportReportShareCandidate
	err := r.db.Raw(`
SELECT u.id AS user_id,
       COALESCE(NULLIF(TRIM(u.name), ''), '') AS name,
       COALESCE(TRIM(u.email), '') AS email
FROM users u
INNER JOIN user_units uu ON uu.user_id = u.id
INNER JOIN units un ON un.id = uu.unit_id AND un.company_id = ?
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  INNER JOIN roles ro ON ro.id = ur.role_id
  WHERE ur.user_id = u.id
    AND ro.name IN ('admin','staff','supervisor','operator')
)
AND u.id <> ?
AND NOT EXISTS (
  SELECT 1 FROM support_report_shares srs
  WHERE srs.support_report_id = ? AND srs.shared_with_user_id = u.id
)
AND (u.name ILIKE ? ESCAPE '\' OR u.email ILIKE ? ESCAPE '\')
GROUP BY u.id, u.name, u.email
ORDER BY name ASC NULLS LAST, u.id ASC
LIMIT ?
`, companyID, authorUserID, reportID, term, term, limit).Scan(&out).Error
	return out, err
}
