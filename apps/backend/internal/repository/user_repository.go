package repository

import (
	"errors"
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
	IsAdminOrHasUnitAccess(userID, unitID string) (bool, error)
	HasCompanyAccess(userID, companyID string) (bool, error)
	IsCompanyOwner(userID, companyID string) (bool, error)
	// GetCompanyIDByUserID returns company_id from the user's first assigned unit (user_units → units).
	GetCompanyIDByUserID(userID string) (companyID string, err error)
	// GetFirstUserUnit returns the first user_units row joined to units for the user (same shape as legacy usage handler query).
	GetFirstUserUnit(userID string) (UserUnitResult, error)
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
		if ur.Role.Name == "admin" {
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
	type row struct {
		CompanyID string
	}
	var res row
	err := r.db.Table("user_units").
		Select("units.company_id").
		Joins("LEFT JOIN units ON user_units.unit_id = units.id").
		Where("user_units.user_id = ?", userID).
		First(&res).Error
	if err != nil {
		return "", err
	}
	return res.CompanyID, nil
}

func (r *userRepository) GetFirstUserUnit(userID string) (UserUnitResult, error) {
	var res UserUnitResult
	err := r.db.Table("user_units").
		Select("user_units.unit_id, units.company_id").
		Joins("LEFT JOIN units ON user_units.unit_id = units.id").
		Where("user_units.user_id = ?", userID).
		First(&res).Error
	return res, err
}
