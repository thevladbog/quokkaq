package services

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

type TemplateService interface {
	CreateTemplate(companyID string, template *models.MessageTemplate) error
	GetAllTemplates(companyID string) ([]models.MessageTemplate, error)
	GetTemplateByID(id, companyID string) (*models.MessageTemplate, error)
	UpdateTemplate(companyID string, template *models.MessageTemplate) error
	DeleteTemplate(id, companyID string) error
}

type templateService struct {
	repo repository.TemplateRepository
}

func NewTemplateService(repo repository.TemplateRepository) TemplateService {
	return &templateService{repo: repo}
}

func (s *templateService) CreateTemplate(companyID string, template *models.MessageTemplate) error {
	if companyID == "" {
		return errors.New("companyId is required")
	}
	template.CompanyID = companyID
	return s.repo.CreateWithDefaultPromotion(companyID, template)
}

func (s *templateService) GetAllTemplates(companyID string) ([]models.MessageTemplate, error) {
	if companyID == "" {
		return nil, errors.New("companyId is required")
	}
	return s.repo.FindAllByCompany(companyID)
}

func (s *templateService) GetTemplateByID(id, companyID string) (*models.MessageTemplate, error) {
	if companyID == "" {
		return nil, errors.New("companyId is required")
	}
	t, err := s.repo.FindByIDAndCompany(id, companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return t, nil
}

func (s *templateService) UpdateTemplate(companyID string, template *models.MessageTemplate) error {
	if companyID == "" {
		return errors.New("companyId is required")
	}
	template.CompanyID = companyID
	return s.repo.UpdateWithDefaultPromotion(companyID, template)
}

func (s *templateService) DeleteTemplate(id, companyID string) error {
	if companyID == "" {
		return errors.New("companyId is required")
	}
	if _, err := s.repo.FindByIDAndCompany(id, companyID); err != nil {
		return err
	}
	return s.repo.Delete(id)
}
