package services

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/repository"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// ErrDeploymentAlreadyReady is returned when SaaS operator + platform_admin already exist.
	ErrDeploymentAlreadyReady = errors.New("system is already initialized")
	// ErrBootstrapValidation is returned for invalid bootstrap input.
	ErrBootstrapValidation = errors.New("bootstrap validation failed")
)

// DeploymentSetupService performs one-shot SaaS operator deployment bootstrap.
type DeploymentSetupService struct {
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
}

func NewDeploymentSetupService(userRepo repository.UserRepository, companyRepo repository.CompanyRepository) *DeploymentSetupService {
	return &DeploymentSetupService{userRepo: userRepo, companyRepo: companyRepo}
}

// IsDeploymentReady is true when a SaaS operator company exists and at least one platform_admin is present.
func (s *DeploymentSetupService) IsDeploymentReady() (bool, error) {
	op, err := s.companyRepo.FindSaaSOperatorCompany()
	if err != nil {
		return false, err
	}
	if op == nil {
		return false, nil
	}
	ids, err := s.userRepo.ListUserIDsByRoleNames([]string{"platform_admin"})
	if err != nil {
		return false, err
	}
	return len(ids) > 0, nil
}

// BootstrapSaaSInput is the payload for first SaaS deployment.
type BootstrapSaaSInput struct {
	CompanyName string
	UnitName    string
	Timezone    string
	AdminName   string
	AdminEmail  string
	AdminPass   string
}

// BootstrapSaaS creates operator company, root subdivision, anonymous kiosk client, roles, and first admin with platform_admin.
func (s *DeploymentSetupService) BootstrapSaaS(ctx context.Context, in BootstrapSaaSInput) error {
	ready, err := s.IsDeploymentReady()
	if err != nil {
		return err
	}
	if ready {
		return ErrDeploymentAlreadyReady
	}
	companyName := strings.TrimSpace(in.CompanyName)
	unitName := strings.TrimSpace(in.UnitName)
	tz := strings.TrimSpace(in.Timezone)
	if tz == "" {
		tz = "Europe/Moscow"
	}
	if unitName == "" {
		unitName = "Main Office"
	}
	email := strings.TrimSpace(strings.ToLower(in.AdminEmail))
	if companyName == "" || strings.TrimSpace(in.AdminName) == "" || email == "" || strings.TrimSpace(in.AdminPass) == "" {
		return fmt.Errorf("%w: missing required fields", ErrBootstrapValidation)
	}
	if len(in.AdminPass) < 8 {
		return fmt.Errorf("%w: password too short", ErrBootstrapValidation)
	}

	if existing, _ := s.userRepo.FindByEmail(ctx, email); existing != nil {
		return fmt.Errorf("%w: email already in use", ErrBootstrapValidation)
	}

	return s.userRepo.Transaction(ctx, func(tx *gorm.DB) error {
		readyTx, err := deploymentReadyTx(tx)
		if err != nil {
			return err
		}
		if readyTx {
			return ErrDeploymentAlreadyReady
		}

		roleNames := []string{"admin", "supervisor", "operator", "platform_admin"}
		var adminRoleID, platformRoleID string
		for _, n := range roleNames {
			role, err := s.userRepo.EnsureRoleExistsTx(tx, n)
			if err != nil {
				return err
			}
			switch n {
			case "admin":
				adminRoleID = role.ID
			case "platform_admin":
				platformRoleID = role.ID
			}
		}
		if adminRoleID == "" || platformRoleID == "" {
			return errors.New("roles not ensured")
		}

		slug, err := tenantslug.PickUniqueSlug(companyName, func(slug string) (bool, error) {
			var n int64
			err := tx.Model(&models.Company{}).Where("slug = ?", slug).Count(&n).Error
			if err != nil {
				return false, err
			}
			return n > 0, nil
		})
		if err != nil {
			return fmt.Errorf("allocate slug: %w", err)
		}

		company := models.Company{
			Name:           companyName,
			Slug:           slug,
			IsSaaSOperator: true,
		}
		if err := tx.Create(&company).Error; err != nil {
			return err
		}

		unit := models.Unit{
			CompanyID: company.ID,
			Name:      unitName,
			Code:      "MAIN",
			Kind:      models.UnitKindSubdivision,
			Timezone:  tz,
		}
		if err := tx.Create(&unit).Error; err != nil {
			return err
		}

		anon := models.UnitClient{
			UnitID:      unit.ID,
			FirstName:   "Аноним",
			LastName:    "",
			PhoneE164:   nil,
			IsAnonymous: true,
		}
		if err := tx.Create(&anon).Error; err != nil {
			return err
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(in.AdminPass), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		hashStr := string(hashed)
		user := models.User{
			ID:       uuid.New().String(),
			Name:     strings.TrimSpace(in.AdminName),
			Email:    &email,
			Password: &hashStr,
		}
		if err := s.userRepo.CreateTx(tx, &user); err != nil {
			return err
		}
		if err := s.userRepo.AssignRoleTx(tx, user.ID, adminRoleID); err != nil {
			return err
		}
		if err := s.userRepo.AssignRoleTx(tx, user.ID, platformRoleID); err != nil {
			return err
		}
		uu := models.UserUnit{
			UserID:      user.ID,
			UnitID:      unit.ID,
			Permissions: nil,
		}
		if err := s.userRepo.CreateUserUnitTx(tx, &uu); err != nil {
			return err
		}
		return s.userRepo.RecomputeUserIsActiveTx(tx, user.ID)
	})
}

func deploymentReadyTx(tx *gorm.DB) (bool, error) {
	var n int64
	if err := tx.Model(&models.Company{}).Where("is_saas_operator = ?", true).Count(&n).Error; err != nil {
		return false, err
	}
	if n == 0 {
		return false, nil
	}
	if err := tx.Model(&models.User{}).
		Joins("JOIN user_roles ON user_roles.user_id = users.id").
		Joins("JOIN roles ON roles.id = user_roles.role_id").
		Where("roles.name = ?", "platform_admin").
		Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}
