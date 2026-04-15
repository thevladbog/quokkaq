package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
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
	FindByEmail(email string) (*models.User, error)
	Update(user *models.User) error
	Delete(id string) error
	AssignUnit(userID, unitID string, permissions []string) error
	RemoveUnit(userID, unitID string) error
	AssignRole(userID, roleID string) error
	AssignRoleTx(tx *gorm.DB, userID, roleID string) error
	FindRoleByName(name string) (*models.Role, error)
	CreatePasswordResetToken(token *models.PasswordResetToken) error
	FindPasswordResetToken(token string) (*models.PasswordResetToken, error)
	DeletePasswordResetToken(id string) error
	Count() (int64, error)
	EnsureRoleExists(name string) (*models.Role, error)
	EnsureRoleExistsTx(tx *gorm.DB, name string) (*models.Role, error)
	IsAdmin(userID string) (bool, error)
	IsPlatformAdmin(userID string) (bool, error)
	IsAdminOrHasUnitAccess(userID, unitID string) (bool, error)
	HasCompanyAccess(userID, companyID string) (bool, error)
	IsCompanyOwner(userID, companyID string) (bool, error)
	// GetCompanyIDByUserID returns company_id from the user's first assigned unit (user_units → units).
	GetCompanyIDByUserID(userID string) (companyID string, err error)
	// GetFirstUserUnit returns the first user_units row joined to units for the user (same shape as legacy usage handler query).
	GetFirstUserUnit(userID string) (UserUnitResult, error)
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

func (r *userRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Preload("Roles.Role").Preload("Units.Unit").Preload("Units").First(&user, "email = ?", email).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) Update(user *models.User) error {
	return r.db.Save(user).Error
}

func (r *userRepository) Delete(id string) error {
	return r.db.Delete(&models.User{}, "id = ?", id).Error
}

func (r *userRepository) AssignUnit(userID, unitID string, permissions []string) error {
	userUnit := models.UserUnit{
		UserID:      userID,
		UnitID:      unitID,
		Permissions: models.StringArray(permissions),
	}
	return r.db.Create(&userUnit).Error
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
