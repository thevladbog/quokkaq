package services

import (
	"encoding/json"
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

var (
	// ErrScreenLayoutTemplatePlanDenied is returned when the subscription plan disables custom screen layouts.
	ErrScreenLayoutTemplatePlanDenied = errors.New("custom screen layouts are not enabled for this plan")
	// ErrScreenLayoutTemplateInvalidDefinition is returned when definition JSON is empty or not an object.
	ErrScreenLayoutTemplateInvalidDefinition = errors.New("invalid template definition")
)

// ScreenLayoutTemplateService manages tenant screen layout templates.
type ScreenLayoutTemplateService struct {
	repo repository.ScreenLayoutTemplateRepository
}

func NewScreenLayoutTemplateService(repo repository.ScreenLayoutTemplateRepository) *ScreenLayoutTemplateService {
	return &ScreenLayoutTemplateService{repo: repo}
}

func (s *ScreenLayoutTemplateService) List(companyID string) ([]models.ScreenLayoutTemplate, error) {
	return s.repo.ListByCompany(companyID)
}

func (s *ScreenLayoutTemplateService) Create(companyID, name string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error) {
	if err := requireCustomScreenLayoutsPlan(companyID); err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name required")
	}
	if len(definition) == 0 || !json.Valid(definition) {
		return nil, ErrScreenLayoutTemplateInvalidDefinition
	}
	var probe map[string]interface{}
	if err := json.Unmarshal(definition, &probe); err != nil || probe == nil {
		return nil, ErrScreenLayoutTemplateInvalidDefinition
	}
	row := &models.ScreenLayoutTemplate{
		CompanyID:  companyID,
		Name:       name,
		Definition: definition,
	}
	if err := s.repo.Create(row); err != nil {
		return nil, err
	}
	return s.repo.GetByIDAndCompany(row.ID, companyID)
}

func (s *ScreenLayoutTemplateService) Update(companyID, id, name string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error) {
	if err := requireCustomScreenLayoutsPlan(companyID); err != nil {
		return nil, err
	}
	existing, err := s.repo.GetByIDAndCompany(id, companyID)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name required")
	}
	if len(definition) == 0 || !json.Valid(definition) {
		return nil, ErrScreenLayoutTemplateInvalidDefinition
	}
	var probe map[string]interface{}
	if err := json.Unmarshal(definition, &probe); err != nil || probe == nil {
		return nil, ErrScreenLayoutTemplateInvalidDefinition
	}
	existing.Name = name
	existing.Definition = definition
	if err := s.repo.Update(existing); err != nil {
		return nil, err
	}
	return s.repo.GetByIDAndCompany(id, companyID)
}

func (s *ScreenLayoutTemplateService) Delete(companyID, id string) error {
	if err := requireCustomScreenLayoutsPlan(companyID); err != nil {
		return err
	}
	return s.repo.Delete(id, companyID)
}

func requireCustomScreenLayoutsPlan(companyID string) error {
	ok, err := CompanyHasCustomScreenLayouts(companyID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrScreenLayoutTemplatePlanDenied
	}
	return nil
}

// GetByID returns a template if it belongs to the company (no plan gate — for future hydration).
func (s *ScreenLayoutTemplateService) GetByID(companyID, id string) (*models.ScreenLayoutTemplate, error) {
	row, err := s.repo.GetByIDAndCompany(id, companyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return row, nil
}
