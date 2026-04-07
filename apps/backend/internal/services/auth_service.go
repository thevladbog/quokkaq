package services

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthService interface {
	Login(email, password string) (string, error)
	GetMe(userID string) (*models.User, error)
	RequestPasswordReset(email string) error
	ResetPassword(token, newPassword string) error
}

type authService struct {
	userRepo    repository.UserRepository
	mailService MailService
}

func NewAuthService(userRepo repository.UserRepository, mailService MailService) AuthService {
	return &authService{
		userRepo:    userRepo,
		mailService: mailService,
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
	html := strings.Replace(PasswordResetEmailTemplate, "{{reset_link}}", resetLink, -1)

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
