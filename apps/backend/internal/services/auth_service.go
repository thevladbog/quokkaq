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

// TokenPair holds short-lived access and long-lived refresh JWTs.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
}

type AuthService interface {
	Login(email, password string) (*TokenPair, error)
	GetMe(userID string) (*models.User, error)
	RequestPasswordReset(email string) error
	ResetPassword(token, newPassword string) error
	Signup(name, email, password, companyName, planCode string) (*TokenPair, error)
	Refresh(refreshToken string) (*TokenPair, error)
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

func jwtSecretBytes() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default_secret_please_change"
	}
	return []byte(secret)
}

func (s *authService) Login(email, password string) (*TokenPair, error) {
	user, err := s.userRepo.FindByEmail(email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	if user.Password == nil {
		return nil, errors.New("invalid credentials")
	}

	err = bcrypt.CompareHashAndPassword([]byte(*user.Password), []byte(password))
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	return s.generateTokenPair(user)
}

func (s *authService) generateAccessToken(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"typ":   "access",
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecretBytes())
}

func (s *authService) generateRefreshToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"typ": "refresh",
		"exp": time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecretBytes())
}

func (s *authService) generateTokenPair(user *models.User) (*TokenPair, error) {
	access, err := s.generateAccessToken(user)
	if err != nil {
		return nil, err
	}
	refresh, err := s.generateRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}
	return &TokenPair{AccessToken: access, RefreshToken: refresh}, nil
}

func (s *authService) Refresh(refreshToken string) (*TokenPair, error) {
	tok, err := jwt.Parse(refreshToken, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecretBytes(), nil
	})
	if err != nil || !tok.Valid {
		return nil, errors.New("invalid refresh token")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid refresh token")
	}
	if typ, _ := claims["typ"].(string); typ != "refresh" {
		return nil, errors.New("invalid refresh token")
	}
	userID, ok := claims["sub"].(string)
	if !ok || strings.TrimSpace(userID) == "" {
		return nil, errors.New("invalid refresh token")
	}
	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}
	return s.generateTokenPair(user)
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

func (s *authService) Signup(name, email, password, companyName, planCode string) (*TokenPair, error) {
	// Check if user already exists
	existingUser, _ := s.userRepo.FindByEmail(email)
	if existingUser != nil {
		return nil, ErrEmailAlreadyExists
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}
	hashedPasswordStr := string(hashedPassword)

	// Get subscription plan (read-only; outside transaction)
	plan, err := s.subscriptionRepo.FindPlanByCode(planCode)
	if err != nil {
		return nil, fmt.Errorf("invalid plan code: %w", err)
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

	var pair *TokenPair
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
		pair, genErr = s.generateTokenPair(user)
		if genErr != nil {
			return fmt.Errorf("failed to generate token: %w", genErr)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return pair, nil
}
