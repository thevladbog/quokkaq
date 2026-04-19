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
)

type InvitationService interface {
	CreateInvitation(email string, targetUnits []byte, targetRoles []byte, templateID string) (*models.Invitation, error)
	GetAllInvitations() ([]models.Invitation, error)
	GetInvitationByID(id string) (*models.Invitation, error)
	AcceptInvitation(token string, userID string) error
	ResendInvitation(id string) error
	DeleteInvitation(id string) error
	GetInvitationByToken(token string) (*models.Invitation, error)
	RegisterUser(token, name, password string) (*models.User, error)
}

type invitationService struct {
	repo            repository.InvitationRepository
	mailService     MailService
	userRepo        repository.UserRepository
	templateService TemplateService
}

func NewInvitationService(repo repository.InvitationRepository, mailService MailService, userRepo repository.UserRepository, templateService TemplateService) InvitationService {
	return &invitationService{
		repo:            repo,
		mailService:     mailService,
		userRepo:        userRepo,
		templateService: templateService,
	}
}

func (s *invitationService) CreateInvitation(email string, targetUnits []byte, targetRoles []byte, templateID string) (*models.Invitation, error) {
	// Check if user already exists
	_, err := s.userRepo.FindByEmail(context.Background(), email)
	if err == nil {
		return nil, errors.New("user with this email already exists")
	}

	// Check if active invitation exists
	existingInv, err := s.repo.FindByEmail(email)
	if err == nil && existingInv.Status == "active" && existingInv.ExpiresAt.After(time.Now()) {
		return nil, errors.New("active invitation already exists for this email")
	}

	token := uuid.New().String()
	invitation := &models.Invitation{
		Email:       email,
		Token:       token,
		Status:      "active",
		ExpiresAt:   time.Now().Add(24 * time.Hour), // 24 hours expiration
		TargetUnits: targetUnits,
		TargetRoles: targetRoles,
	}

	if err := s.repo.Create(invitation); err != nil {
		return nil, err
	}

	// Send email
	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	inviteLink := fmt.Sprintf("%s/register/%s", baseURL, token)

	var subject, emailBody string

	if templateID != "" {
		template, err := s.templateService.GetTemplateByID(templateID)
		if err != nil {
			// If template ID is provided but not found, we should probably return an error
			// to let the user know something went wrong.
			return nil, fmt.Errorf("template not found: %w", err)
		}
		subject = template.Subject
		// Simple replacement for now. In a real app, use a template engine.
		emailBody = template.Content
		// Replace placeholders
		emailBody = strings.ReplaceAll(emailBody, "{{link}}", inviteLink)
		emailBody = strings.ReplaceAll(emailBody, "{{email}}", email)
	} else {
		subject = "Invitation to QuokkaQ"
		emailBody = fmt.Sprintf("You have been invited to join QuokkaQ. Click here to register: <a href=\"%s\">%s</a>", inviteLink, inviteLink)
	}

	// We ignore email error for now to not block the flow, or we could log it
	_ = s.mailService.SendMail(email, subject, emailBody)

	return invitation, nil
}

func (s *invitationService) GetAllInvitations() ([]models.Invitation, error) {
	return s.repo.FindAll()
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
		_ = s.repo.Update(invitation) // Best effort update, error not critical
		return errors.New("invitation expired")
	}

	invitation.Status = "accepted"
	invitation.UserID = &userID
	return s.repo.Update(invitation)
}

func (s *invitationService) DeleteInvitation(id string) error {
	return s.repo.Delete(id)
}

func (s *invitationService) ResendInvitation(id string) error {
	invitation, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	if invitation.Status != "active" {
		return errors.New("invitation is not active")
	}

	if invitation.ExpiresAt.Before(time.Now()) {
		return errors.New("invitation expired")
	}

	// Send email
	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	inviteLink := fmt.Sprintf("%s/register/%s", baseURL, invitation.Token)
	emailBody := fmt.Sprintf("You have been invited to join QuokkaQ. Click here to register: <a href=\"%s\">%s</a>", inviteLink, inviteLink)

	// We ignore email error for now to not block the flow, or we could log it
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

	// Hash password
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

	// Assign Units
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

	// Assign Roles
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

	// Mark invitation accepted
	invitation.Status = "accepted"
	userID := user.ID
	invitation.UserID = &userID
	if err := s.repo.Update(invitation); err != nil {
		return nil, err
	}

	return user, nil
}
