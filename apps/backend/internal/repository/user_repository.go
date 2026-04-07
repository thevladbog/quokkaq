package repository

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type UserRepository interface {
	Create(user *models.User) error
	FindAll(search string) ([]models.User, error)
	FindByID(id string) (*models.User, error)
	FindByEmail(email string) (*models.User, error)
	Update(user *models.User) error
	Delete(id string) error
	AssignUnit(userID, unitID string, permissions []string) error
	RemoveUnit(userID, unitID string) error
	AssignRole(userID, roleID string) error
	FindRoleByName(name string) (*models.Role, error)
	CreatePasswordResetToken(token *models.PasswordResetToken) error
	FindPasswordResetToken(token string) (*models.PasswordResetToken, error)
	DeletePasswordResetToken(id string) error
	Count() (int64, error)
	EnsureRoleExists(name string) (*models.Role, error)
	IsAdmin(userID string) (bool, error)
	IsAdminOrHasUnitAccess(userID, unitID string) (bool, error)
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
