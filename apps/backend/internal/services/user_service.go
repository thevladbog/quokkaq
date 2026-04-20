package services

import (
	"context"
	"errors"
	"slices"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Client validation errors for PATCH /users/{id} (map to HTTP 400).
var (
	ErrUpdateUserEmptyInput = errors.New("empty update")
	ErrUpdateUserNameEmpty  = errors.New("name cannot be empty")
)

type UserService interface {
	CreateUser(user *models.User) error
	GetAllUsers(search string) ([]models.User, error)
	// ListUsersForCompany lists users visible in one tenant (see repository.ListUsersForCompany).
	ListUsersForCompany(companyID string, search string, includeGlobalRoleUsers bool) ([]models.User, error)
	GetUserByID(id string) (*models.User, error)
	UpdateUser(id string, input *models.UpdateUserInput) error
	DeleteUser(id string) error
	AssignUnit(userID, unitID string, permissions []string) error
	RemoveUnit(userID, unitID string) error
	AssignRole(userID, roleID string) error
	IsSystemInitialized() (bool, error)
	EnsureRoleExists(name string) (*models.Role, error)
}

type userService struct {
	repo        repository.UserRepository
	companyRepo repository.CompanyRepository
}

func NewUserService(repo repository.UserRepository, companyRepo repository.CompanyRepository) UserService {
	return &userService{repo: repo, companyRepo: companyRepo}
}

func (s *userService) CreateUser(user *models.User) error {
	// Check if email exists
	if user.Email != nil {
		existing, _ := s.repo.FindByEmail(context.Background(), *user.Email)
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

func (s *userService) ListUsersForCompany(companyID string, search string, includeGlobalRoleUsers bool) ([]models.User, error) {
	return s.repo.ListUsersForCompany(companyID, search, includeGlobalRoleUsers)
}

func (s *userService) GetUserByID(id string) (*models.User, error) {
	return s.repo.FindByID(context.Background(), id)
}

func userHasAdminRole(u *models.User) bool {
	for i := range u.Roles {
		if u.Roles[i].Role.Name == "admin" {
			return true
		}
	}
	return false
}

func (s *userService) UpdateUser(id string, input *models.UpdateUserInput) error {
	if input == nil {
		return ErrUpdateUserEmptyInput
	}
	existing, err := s.repo.FindByID(context.Background(), id)
	if err != nil {
		return err
	}

	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			return ErrUpdateUserNameEmpty
		}
		existing.Name = strings.TrimSpace(*input.Name)
	}
	if input.Email != nil && *input.Email != "" {
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

	wantsAdmin := slices.Contains(input.Roles, "admin")

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateTx(tx, existing); err != nil {
			return err
		}
		fresh, err := s.repo.FindByIDTx(tx, id)
		if err != nil {
			return err
		}
		hasAdmin := userHasAdminRole(fresh)

		if wantsAdmin && !hasAdmin {
			adminRole, err := s.repo.FindRoleByName("admin")
			if err != nil {
				return err
			}
			return s.repo.AssignRoleTx(tx, id, adminRole.ID)
		}
		if !wantsAdmin && hasAdmin {
			return s.repo.RemoveUserRoleByNameTx(tx, id, "admin")
		}
		return nil
	})
	if err != nil {
		return err
	}
	return s.repo.RecomputeUserIsActive(context.Background(), id)
}

func (s *userService) DeleteUser(id string) error {
	return s.repo.Delete(id)
}

func (s *userService) AssignUnit(userID, unitID string, permissions []string) error {
	if err := s.repo.AssignUnit(userID, unitID, permissions); err != nil {
		return err
	}
	return s.repo.RecomputeUserIsActive(context.Background(), userID)
}

func (s *userService) AssignRole(userID, roleID string) error {
	return s.repo.AssignRole(userID, roleID)
}

func (s *userService) RemoveUnit(userID, unitID string) error {
	if err := s.repo.RemoveUnit(userID, unitID); err != nil {
		return err
	}
	return s.repo.RecomputeUserIsActive(context.Background(), userID)
}

func (s *userService) IsSystemInitialized() (bool, error) {
	op, err := s.companyRepo.FindSaaSOperatorCompany()
	if err != nil {
		return false, err
	}
	if op == nil {
		return false, nil
	}
	ids, err := s.repo.ListUserIDsByRoleNames([]string{"platform_admin"})
	if err != nil {
		return false, err
	}
	return len(ids) > 0, nil
}

func (s *userService) EnsureRoleExists(name string) (*models.Role, error) {
	return s.repo.EnsureRoleExists(name)
}
