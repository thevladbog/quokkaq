package services

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserService interface {
	CreateUser(user *models.User) error
	GetAllUsers(search string) ([]models.User, error)
	GetUserByID(id string) (*models.User, error)
	UpdateUser(id string, input *models.UpdateUserInput) error
	DeleteUser(id string) error
	AssignUnit(userID, unitID string, permissions []string) error
	RemoveUnit(userID, unitID string) error
	AssignRole(userID, roleID string) error
	IsSystemInitialized() (bool, error)
	CreateFirstAdmin(user *models.User) error
	EnsureRoleExists(name string) (*models.Role, error)
}

type userService struct {
	repo repository.UserRepository
}

func NewUserService(repo repository.UserRepository) UserService {
	return &userService{repo: repo}
}

func (s *userService) CreateUser(user *models.User) error {
	// Check if email exists
	if user.Email != nil {
		existing, _ := s.repo.FindByEmail(*user.Email)
		if existing != nil {
			return errors.New("email already in use")
		}
	}

	// Hash password if present
	if user.Password != nil {
		hashed, err := bcrypt.GenerateFromPassword([]byte(*user.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		hashedStr := string(hashed)
		user.Password = &hashedStr
	}

	if user.ID == "" {
		user.ID = uuid.New().String()
	}

	return s.repo.Create(user)
}

func (s *userService) GetAllUsers(search string) ([]models.User, error) {
	return s.repo.FindAll(search)
}

func (s *userService) GetUserByID(id string) (*models.User, error) {
	return s.repo.FindByID(id)
}

func userHasAdminRole(u *models.User) bool {
	for i := range u.Roles {
		if u.Roles[i].Role.Name == "admin" {
			return true
		}
	}
	return false
}

func sliceContainsString(ss []string, v string) bool {
	for _, s := range ss {
		if s == v {
			return true
		}
	}
	return false
}

func (s *userService) UpdateUser(id string, input *models.UpdateUserInput) error {
	if input == nil {
		return errors.New("empty update")
	}
	existing, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	if input.Name != nil && *input.Name != "" {
		existing.Name = *input.Name
	}
	if input.Email != nil {
		existing.Email = input.Email
	}
	if input.Password != nil && *input.Password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(*input.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		hashedStr := string(hashed)
		existing.Password = &hashedStr
	}
	if input.PhotoURL != nil {
		if *input.PhotoURL == "" {
			existing.PhotoURL = nil
		} else {
			existing.PhotoURL = input.PhotoURL
		}
	}

	if input.Roles == nil {
		return s.repo.Update(existing)
	}

	wantsAdmin := sliceContainsString(input.Roles, "admin")
	hasAdmin := userHasAdminRole(existing)

	var adminRole *models.Role
	if wantsAdmin && !hasAdmin {
		var err error
		adminRole, err = s.repo.FindRoleByName("admin")
		if err != nil {
			return err
		}
	}

	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, existing); err != nil {
			return err
		}
		if wantsAdmin && !hasAdmin {
			return s.repo.AssignRoleTx(tx, id, adminRole.ID)
		}
		if !wantsAdmin && hasAdmin {
			return s.repo.RemoveUserRoleByNameTx(tx, id, "admin")
		}
		return nil
	})
}

func (s *userService) DeleteUser(id string) error {
	return s.repo.Delete(id)
}

func (s *userService) AssignUnit(userID, unitID string, permissions []string) error {
	return s.repo.AssignUnit(userID, unitID, permissions)
}

func (s *userService) AssignRole(userID, roleID string) error {
	return s.repo.AssignRole(userID, roleID)
}

func (s *userService) RemoveUnit(userID, unitID string) error {
	return s.repo.RemoveUnit(userID, unitID)
}

func (s *userService) IsSystemInitialized() (bool, error) {
	count, err := s.repo.Count()
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *userService) CreateFirstAdmin(user *models.User) error {
	// 1. Check if system is already initialized
	initialized, err := s.IsSystemInitialized()
	if err != nil {
		return err
	}
	if initialized {
		return errors.New("system is already initialized")
	}

	// 2. Ensure roles exist
	roles := []string{"admin", "supervisor", "operator"}
	for _, roleName := range roles {
		if _, err := s.EnsureRoleExists(roleName); err != nil {
			return err
		}
	}

	// 3. Find Admin Role
	adminRole, err := s.repo.FindRoleByName("admin")
	if err != nil {
		return errors.New("admin role not found")
	}

	// 4. Create User
	if err := s.CreateUser(user); err != nil {
		return err
	}

	// 5. Assign Admin Role
	return s.AssignRole(user.ID, adminRole.ID)
}

func (s *userService) EnsureRoleExists(name string) (*models.Role, error) {
	return s.repo.EnsureRoleExists(name)
}
