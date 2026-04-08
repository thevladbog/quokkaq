package services

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ErrEmailAlreadyExists is returned from Signup when the email is already registered.
var ErrEmailAlreadyExists = errors.New("email already exists")

type AuthService interface {
	Login(email, password string) (string, error)
	GetMe(userID string) (*models.User, error)
	RequestPasswordReset(email string) error
	ResetPassword(token, newPassword string) error
	Signup(name, email, password, companyName, planCode string) (string, error)
}

type authService struct {
	userRepo         repository.UserRepository
	mailService      MailService
	subscriptionRepo repository.SubscriptionRepository
}

func NewAuthService(userRepo repository.UserRepository, mailService MailService, subscriptionRepo repository.SubscriptionRepository) AuthService {
	return &authService{
		userRepo:         userRepo,
		mailService:      mailService,
		subscriptionRepo: subscriptionRepo,
	}
}

func (s *authService) Login(email, password string) (string, error) {
	user, err := s.userRepo.FindByEmail(email)
	if err != nil {
		return "", errors.New("invalid credentials")
	}

	if user.Password == nil {
		return "", errors.New("invalid credentials")
	}

	err = bcrypt.CompareHashAndPassword([]byte(*user.Password), []byte(password))
	if err != nil {
		return "", errors.New("invalid credentials")
	}

	return s.generateToken(user)
}

func (s *authService) generateToken(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"exp":   time.Now().Add(time.Hour * 24).Unix(), // 24 hours
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default_secret_please_change"
	}

	return token.SignedString([]byte(secret))
}

func (s *authService) GetMe(userID string) (*models.User, error) {
	return s.userRepo.FindByID(userID)
}

func (s *authService) RequestPasswordReset(email string) error {
	user, err := s.userRepo.FindByEmail(email)
	if err != nil {
		// Don't reveal if user exists
		return nil
	}

	// Generate token
	token := uuid.New().String()
	expiresAt := time.Now().Add(1 * time.Hour)

	resetToken := &models.PasswordResetToken{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: expiresAt,
	}

	if err := s.userRepo.CreatePasswordResetToken(resetToken); err != nil {
		return err
	}

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}

	// Send email
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", baseURL, token)
	subject := "Сброс пароля | QuokkaQ"
	html := strings.ReplaceAll(PasswordResetEmailTemplate, "{{reset_link}}", resetLink)

	return s.mailService.SendMail(email, subject, html)
}

func (s *authService) ResetPassword(token, newPassword string) error {
	resetToken, err := s.userRepo.FindPasswordResetToken(token)
	if err != nil {
		return errors.New("invalid or expired token")
	}

	if time.Now().After(resetToken.ExpiresAt) {
		return errors.New("token expired")
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	hashedPasswordStr := string(hashedPassword)

	// Update user password
	user := &resetToken.User
	user.Password = &hashedPasswordStr
	if err := s.userRepo.Update(user); err != nil {
		return err
	}

	// Delete token
	return s.userRepo.DeletePasswordResetToken(resetToken.ID)
}

func (s *authService) Signup(name, email, password, companyName, planCode string) (string, error) {
	// Check if user already exists
	existingUser, _ := s.userRepo.FindByEmail(email)
	if existingUser != nil {
		return "", ErrEmailAlreadyExists
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}
	hashedPasswordStr := string(hashedPassword)

	// Get subscription plan (read-only; outside transaction)
	plan, err := s.subscriptionRepo.FindPlanByCode(planCode)
	if err != nil {
		return "", fmt.Errorf("invalid plan code: %w", err)
	}

	company := &models.Company{
		Name:         companyName,
		BillingEmail: email,
	}

	trialEnd := time.Now().AddDate(0, 0, 14)
	subscription := &models.Subscription{
		PlanID:             plan.ID,
		Status:             "trial",
		CurrentPeriodStart: time.Now(),
		CurrentPeriodEnd:   trialEnd,
		TrialEnd:           &trialEnd,
	}

	user := &models.User{
		Name:     name,
		Email:    &email,
		Password: &hashedPasswordStr,
		Type:     "staff",
	}

	var token string
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(company).Error; err != nil {
			return fmt.Errorf("failed to create company: %w", err)
		}

		subscription.CompanyID = company.ID
		if err := tx.Create(subscription).Error; err != nil {
			return fmt.Errorf("failed to create subscription: %w", err)
		}

		company.SubscriptionID = &subscription.ID
		if err := s.userRepo.CreateTx(tx, user); err != nil {
			return fmt.Errorf("failed to create user: %w", err)
		}

		company.OwnerUserID = user.ID
		if err := tx.Save(company).Error; err != nil {
			return fmt.Errorf("failed to update company owner: %w", err)
		}

		adminRole, err := s.userRepo.EnsureRoleExistsTx(tx, "admin")
		if err != nil {
			return fmt.Errorf("failed to get admin role: %w", err)
		}

		if err := s.userRepo.AssignRoleTx(tx, user.ID, adminRole.ID); err != nil {
			return fmt.Errorf("failed to assign admin role: %w", err)
		}

		var genErr error
		token, genErr = s.generateToken(user)
		if genErr != nil {
			return fmt.Errorf("failed to generate token: %w", genErr)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return token, nil
}
