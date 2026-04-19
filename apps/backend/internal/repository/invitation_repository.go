package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"

	"gorm.io/gorm"
)

type InvitationRepository interface {
	Create(invitation *models.Invitation) error
	FindAllByCompany(companyID string) ([]models.Invitation, error)
	FindByID(id string) (*models.Invitation, error)
	FindByIDAndCompany(id, companyID string) (*models.Invitation, error)
	FindByToken(token string) (*models.Invitation, error)
	// FindActiveByCompanyAndEmail returns an active, non-expired invitation for this tenant and email, if any.
	FindActiveByCompanyAndEmail(companyID, email string) (*models.Invitation, error)
	Update(invitation *models.Invitation) error
	Delete(id string) error
}

type invitationRepository struct {
	db *gorm.DB
}

func NewInvitationRepository() InvitationRepository {
	return &invitationRepository{db: database.DB}
}

func (r *invitationRepository) Create(invitation *models.Invitation) error {
	return r.db.Create(invitation).Error
}

func (r *invitationRepository) FindAllByCompany(companyID string) ([]models.Invitation, error) {
	var invitations []models.Invitation
	err := r.db.Preload("User").Where("company_id = ?", companyID).Order("created_at DESC").Find(&invitations).Error
	return invitations, err
}

func (r *invitationRepository) FindByID(id string) (*models.Invitation, error) {
	var invitation models.Invitation
	err := r.db.Preload("User").First(&invitation, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

func (r *invitationRepository) FindByIDAndCompany(id, companyID string) (*models.Invitation, error) {
	var invitation models.Invitation
	err := r.db.Preload("User").First(&invitation, "id = ? AND company_id = ?", id, companyID).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

func (r *invitationRepository) FindByToken(token string) (*models.Invitation, error) {
	var invitation models.Invitation
	err := r.db.Preload("User").First(&invitation, "token = ?", token).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

func (r *invitationRepository) FindActiveByCompanyAndEmail(companyID, email string) (*models.Invitation, error) {
	var invitation models.Invitation
	err := r.db.Where("company_id = ? AND email = ? AND status = ? AND expires_at > ?", companyID, email, "active", time.Now()).
		Order("created_at DESC").
		First(&invitation).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

func (r *invitationRepository) Update(invitation *models.Invitation) error {
	return r.db.Save(invitation).Error
}

func (r *invitationRepository) Delete(id string) error {
	return r.db.Delete(&models.Invitation{}, "id = ?", id).Error
}
