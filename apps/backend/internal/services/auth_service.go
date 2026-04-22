package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/billingperiod"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/pkg/tenantslug"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/subscriptionplan"
	"quokkaq-go-backend/pkg/database"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ErrEmailAlreadyExists is returned from Signup when the email is already registered.
var ErrEmailAlreadyExists = errors.New("email already exists")

// ErrPrivacyConsentRequired is returned when Signup is called without accepted privacy consent.
var ErrPrivacyConsentRequired = errors.New("privacy consent is required")

// ErrInvalidCompanySlug is returned when optional companySlug fails format/reserved rules.
var ErrInvalidCompanySlug = errors.New("invalid company slug")

// ErrCompanySlugTaken is returned when optional companySlug is already in use.
var ErrCompanySlugTaken = errors.New("company slug already taken")

// ErrUserInactive is returned when issuing tokens for a disabled user account.
var ErrUserInactive = errors.New("user account is inactive")

// ErrTenantRBACNotConfigured is returned when TenantRBACRepository was not wired (signup requires it).
var ErrTenantRBACNotConfigured = errors.New("tenant rbac not configured")

// ErrInvalidSignupBillingPeriod is returned when billingPeriod is not month or annual.
var ErrInvalidSignupBillingPeriod = errors.New("billingPeriod must be month or annual")

// ErrAnnualBillingNotAvailableForPlan is returned when the client requests annual prepay but the plan has no annual option.
var ErrAnnualBillingNotAvailableForPlan = errors.New("annual billing is not available for selected plan")

// IsUniqueConstraintViolation reports Postgres unique violations (23505) and similar driver errors.
func IsUniqueConstraintViolation(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "23505")
}

// TokenPair holds short-lived access and long-lived refresh JWTs.
type TokenPair struct {
	AccessToken  string
	RefreshToken string
}

type AuthService interface {
	Login(email, password, tenantSlug string) (*TokenPair, error)
	GetMe(userID string) (*models.User, error)
	RequestPasswordReset(email string) error
	ResetPassword(token, newPassword string) error
	Signup(name, email, password, companyName, planCode, billingPeriod string, preferredSlug *string, privacyConsentAccepted bool) (*TokenPair, error)
	Refresh(refreshToken string) (*TokenPair, error)
	// IssueTokenPairForUserID issues JWT access+refresh for an existing user (e.g. after SSO).
	IssueTokenPairForUserID(userID string) (*TokenPair, error)
}

type authService struct {
	userRepo         repository.UserRepository
	companyRepo      repository.CompanyRepository
	mailService      MailService
	subscriptionRepo repository.SubscriptionRepository
	tenantRBAC       repository.TenantRBACRepository
	leadIssues       *LeadIssueService
}

func NewAuthService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	mailService MailService,
	subscriptionRepo repository.SubscriptionRepository,
	tenantRBAC repository.TenantRBACRepository,
	leadIssues *LeadIssueService,
) (AuthService, error) {
	if tenantRBAC == nil {
		return nil, ErrTenantRBACNotConfigured
	}
	return &authService{
		userRepo:         userRepo,
		companyRepo:      companyRepo,
		mailService:      mailService,
		subscriptionRepo: subscriptionRepo,
		tenantRBAC:       tenantRBAC,
		leadIssues:       leadIssues,
	}, nil
}

func jwtSecretBytes() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "default_secret_please_change"
	}
	return []byte(secret)
}

func (s *authService) Login(email, password, tenantSlug string) (*TokenPair, error) {
	user, err := s.userRepo.FindByEmail(context.Background(), email)
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

	slug := tenantslug.Normalize(strings.TrimSpace(tenantSlug))
	if slug != "" {
		comp, err := s.companyRepo.FindBySlug(slug)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, errors.New("invalid credentials")
			}
			return nil, err
		}
		ok, err := s.userRepo.HasCompanyAccess(user.ID, comp.ID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("invalid credentials")
		}
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
	if !user.IsActive {
		return nil, ErrUserInactive
	}
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

func (s *authService) IssueTokenPairForUserID(userID string) (*TokenPair, error) {
	user, err := s.userRepo.FindByID(context.Background(), userID)
	if err != nil {
		return nil, err
	}
	return s.generateTokenPair(user)
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
	user, err := s.userRepo.FindByID(context.Background(), userID)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}
	return s.generateTokenPair(user)
}

func (s *authService) GetMe(userID string) (*models.User, error) {
	return s.userRepo.FindByID(context.Background(), userID)
}

func (s *authService) RequestPasswordReset(email string) error {
	user, err := s.userRepo.FindByEmail(context.Background(), email)
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

func (s *authService) Signup(name, email, password, companyName, planCode, billingPeriod string, preferredSlug *string, privacyConsentAccepted bool) (*TokenPair, error) {
	if !privacyConsentAccepted {
		return nil, ErrPrivacyConsentRequired
	}
	// Check if user already exists
	existingUser, _ := s.userRepo.FindByEmail(context.Background(), email)
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

	bill, err := billingperiod.ParseWithMonthDefault(billingPeriod)
	if err != nil {
		return nil, ErrInvalidSignupBillingPeriod
	}
	if bill == "annual" && !subscriptionplan.HasAnnualPrepayConfig(plan) {
		return nil, ErrAnnualBillingNotAvailableForPlan
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
	if bill == "annual" {
		meta, jerr := json.Marshal(map[string]string{"preferredBillingPeriod": "annual"})
		if jerr != nil {
			return nil, fmt.Errorf("subscription metadata: %w", jerr)
		}
		subscription.Metadata = meta
	}

	user := &models.User{
		Name:     name,
		Email:    &email,
		Password: &hashedPasswordStr,
		Type:     "staff",
	}

	if s.tenantRBAC == nil {
		return nil, ErrTenantRBACNotConfigured
	}

	var pair *TokenPair
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		var slug string
		if preferredSlug != nil && strings.TrimSpace(*preferredSlug) != "" {
			n := tenantslug.Normalize(strings.TrimSpace(*preferredSlug))
			if err := tenantslug.Validate(n); err != nil {
				return ErrInvalidCompanySlug
			}
			var cnt int64
			if err := tx.Model(&models.Company{}).Where("slug = ?", n).Count(&cnt).Error; err != nil {
				return err
			}
			if cnt > 0 {
				return ErrCompanySlugTaken
			}
			slug = n
		} else {
			var pickErr error
			slug, pickErr = tenantslug.PickUniqueSlug(companyName, func(s string) (bool, error) {
				var n int64
				if err := tx.Model(&models.Company{}).Where("slug = ?", s).Count(&n).Error; err != nil {
					return false, err
				}
				return n > 0, nil
			})
			if pickErr != nil {
				return pickErr
			}
		}
		company.Slug = slug

		if err := tx.Create(company).Error; err != nil {
			if IsUniqueConstraintViolation(err) {
				return ErrCompanySlugTaken
			}
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

		sysRoleID, err := s.tenantRBAC.EnsureSystemTenantRoleTx(tx, company.ID)
		if err != nil {
			return fmt.Errorf("ensure system tenant role: %w", err)
		}
		if err := s.tenantRBAC.ReplaceUserTenantRolesTx(tx, user.ID, company.ID, []string{sysRoleID}, false); err != nil {
			return fmt.Errorf("assign system tenant role: %w", err)
		}
		if err := s.tenantRBAC.SyncUserUnitsFromTenantRolesTx(tx, user.ID, company.ID); err != nil {
			return fmt.Errorf("sync user units from tenant roles: %w", err)
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
	if s.leadIssues != nil {
		s.leadIssues.NotifyTrialRegistration(context.Background(), company.Name, company.Slug, name, email, plan.Code, bill)
	}
	return pair, nil
}
