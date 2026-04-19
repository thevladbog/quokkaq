package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type InvitationService interface {
	CreateInvitation(companyID, email string, targetUnits []byte, targetRoles []byte, templateID string) (*models.Invitation, error)
	GetAllInvitations(companyID string) ([]models.Invitation, error)
	GetInvitationByID(id string) (*models.Invitation, error)
	AcceptInvitation(token string, userID string) error
	ResendInvitation(id, companyID string) error
	DeleteInvitation(id, companyID string) error
	GetInvitationByToken(token string) (*models.Invitation, error)
	RegisterUser(token, name, password string) (*models.User, error)
}

type invitationService struct {
	repo            repository.InvitationRepository
	mailService     MailService
	userRepo        repository.UserRepository
	unitRepo        repository.UnitRepository
	templateService TemplateService
}

func NewInvitationService(
	repo repository.InvitationRepository,
	mailService MailService,
	userRepo repository.UserRepository,
	unitRepo repository.UnitRepository,
	templateService TemplateService,
) InvitationService {
	return &invitationService{
		repo:            repo,
		mailService:     mailService,
		userRepo:        userRepo,
		unitRepo:        unitRepo,
		templateService: templateService,
	}
}

func validateInvitationTargetUnits(unitRepo repository.UnitRepository, companyID string, raw json.RawMessage) error {
	if len(raw) == 0 {
		return nil
	}
	var targetUnits []struct {
		UnitID      string   `json:"unitId"`
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(raw, &targetUnits); err != nil {
		return fmt.Errorf("invalid targetUnits: %w", err)
	}
	for _, u := range targetUnits {
		uid := strings.TrimSpace(u.UnitID)
		if uid == "" {
			continue
		}
		un, err := unitRepo.FindByIDLight(uid)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("unit not found: %s", uid)
			}
			return err
		}
		if un.CompanyID != companyID {
			return fmt.Errorf("unit %s does not belong to this organization", uid)
		}
	}
	return nil
}

func (s *invitationService) CreateInvitation(companyID, email string, targetUnits []byte, targetRoles []byte, templateID string) (*models.Invitation, error) {
	if companyID == "" {
		return nil, errors.New("companyId is required")
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return nil, errors.New("email is required")
	}

	_, err := s.userRepo.FindByEmail(context.Background(), email)
	if err == nil {
		return nil, errors.New("user with this email already exists")
	}

	_, err = s.repo.FindActiveByCompanyAndEmail(companyID, email)
	if err == nil {
		return nil, errors.New("active invitation already exists for this email")
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	if err := validateInvitationTargetUnits(s.unitRepo, companyID, targetUnits); err != nil {
		return nil, err
	}

	token := uuid.New().String()
	invitation := &models.Invitation{
		CompanyID:   companyID,
		Email:       email,
		Token:       token,
		Status:      "active",
		ExpiresAt:   time.Now().Add(24 * time.Hour),
		TargetUnits: targetUnits,
		TargetRoles: targetRoles,
	}

	if err := s.repo.Create(invitation); err != nil {
		return nil, err
	}

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	inviteLink := fmt.Sprintf("%s/register/%s", baseURL, token)

	var subject, emailBody string

	if templateID != "" {
		template, err := s.templateService.GetTemplateByID(templateID, companyID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, fmt.Errorf("template not found: %w", err)
			}
			return nil, fmt.Errorf("template not found: %w", err)
		}
		subject = template.Subject
		emailBody = template.Content
		emailBody = strings.ReplaceAll(emailBody, "{{link}}", inviteLink)
		emailBody = strings.ReplaceAll(emailBody, "{{email}}", email)
	} else {
		subject = "Invitation to QuokkaQ"
		emailBody = fmt.Sprintf("You have been invited to join QuokkaQ. Click here to register: <a href=\"%s\">%s</a>", inviteLink, inviteLink)
	}

	_ = s.mailService.SendMail(email, subject, emailBody)

	return invitation, nil
}

func (s *invitationService) GetAllInvitations(companyID string) ([]models.Invitation, error) {
	if companyID == "" {
		return nil, errors.New("companyId is required")
	}
	return s.repo.FindAllByCompany(companyID)
}

func (s *invitationService) GetInvitationByID(id string) (*models.Invitation, error) {
	return s.repo.FindByID(id)
}

func (s *invitationService) AcceptInvitation(token string, userID string) error {
	invitation, err := s.repo.FindByToken(token)
	if err != nil {
		return errors.New("invalid token")
	}

	if invitation.Status != "active" {
		return errors.New("invitation is not active")
	}

	if invitation.ExpiresAt.Before(time.Now()) {
		invitation.Status = "inactive"
		_ = s.repo.Update(invitation)
		return errors.New("invitation expired")
	}

	invitation.Status = "accepted"
	invitation.UserID = &userID
	return s.repo.Update(invitation)
}

func (s *invitationService) DeleteInvitation(id, companyID string) error {
	if companyID == "" {
		return errors.New("companyId is required")
	}
	if _, err := s.repo.FindByIDAndCompany(id, companyID); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

func (s *invitationService) ResendInvitation(id, companyID string) error {
	if companyID == "" {
		return errors.New("companyId is required")
	}
	invitation, err := s.repo.FindByIDAndCompany(id, companyID)
	if err != nil {
		return err
	}

	if invitation.Status != "active" {
		return errors.New("invitation is not active")
	}

	if invitation.ExpiresAt.Before(time.Now()) {
		return errors.New("invitation expired")
	}

	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	inviteLink := fmt.Sprintf("%s/register/%s", baseURL, invitation.Token)
	emailBody := fmt.Sprintf("You have been invited to join QuokkaQ. Click here to register: <a href=\"%s\">%s</a>", inviteLink, inviteLink)

	_ = s.mailService.SendMail(invitation.Email, "Invitation to QuokkaQ", emailBody)

	return nil
}

func (s *invitationService) GetInvitationByToken(token string) (*models.Invitation, error) {
	invitation, err := s.repo.FindByToken(token)
	if err != nil {
		return nil, errors.New("invalid token")
	}

	if invitation.Status != "active" {
		return nil, errors.New("invitation is not active")
	}

	if invitation.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("invitation expired")
	}

	return invitation, nil
}

func (s *invitationService) RegisterUser(token, name, password string) (*models.User, error) {
	invitation, err := s.repo.FindByToken(token)
	if err != nil {
		return nil, errors.New("invalid token")
	}

	if invitation.Status != "active" {
		return nil, errors.New("invitation is not active")
	}

	if invitation.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("invitation expired")
	}

	if strings.TrimSpace(invitation.CompanyID) == "" {
		return nil, errors.New("invalid invitation")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	hashedStr := string(hashed)

	user := &models.User{
		ID:       uuid.New().String(),
		Email:    &invitation.Email,
		Name:     name,
		Password: &hashedStr,
		IsActive: true,
		Type:     "human",
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, err
	}

	if len(invitation.TargetUnits) > 0 {
		var targetUnits []struct {
			UnitID      string   `json:"unitId"`
			Permissions []string `json:"permissions"`
		}
		if err := json.Unmarshal(invitation.TargetUnits, &targetUnits); err == nil {
			for _, unit := range targetUnits {
				_ = s.userRepo.AssignUnit(user.ID, unit.UnitID, unit.Permissions)
			}
		}
	}

	if len(invitation.TargetRoles) > 0 {
		var targetRoles []string
		if err := json.Unmarshal(invitation.TargetRoles, &targetRoles); err == nil {
			for _, roleName := range targetRoles {
				role, err := s.userRepo.FindRoleByName(roleName)
				if err == nil && role != nil {
					_ = s.userRepo.AssignRole(user.ID, role.ID)
				}
			}
		}
	}

	invitation.Status = "accepted"
	userID := user.ID
	invitation.UserID = &userID
	if err := s.repo.Update(invitation); err != nil {
		return nil, err
	}

	return user, nil
}
