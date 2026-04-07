package services

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

type TemplateService interface {
	CreateTemplate(template *models.MessageTemplate) error
	GetAllTemplates() ([]models.MessageTemplate, error)
	GetTemplateByID(id string) (*models.MessageTemplate, error)
	UpdateTemplate(template *models.MessageTemplate) error
	DeleteTemplate(id string) error
}

type templateService struct {
	repo repository.TemplateRepository
}

func NewTemplateService(repo repository.TemplateRepository) TemplateService {
	return &templateService{repo: repo}
}

func (s *templateService) CreateTemplate(template *models.MessageTemplate) error {
	// If this is set as default, unset other defaults?
	// For now, simple create
	return s.repo.Create(template)
}

func (s *templateService) GetAllTemplates() ([]models.MessageTemplate, error) {
	return s.repo.FindAll()
}

func (s *templateService) GetTemplateByID(id string) (*models.MessageTemplate, error) {
	return s.repo.FindByID(id)
}

func (s *templateService) UpdateTemplate(template *models.MessageTemplate) error {
	return s.repo.Update(template)
}

func (s *templateService) DeleteTemplate(id string) error {
	return s.repo.Delete(id)
}
