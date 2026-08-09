package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

var (
	// ErrScreenLayoutTemplatePlanDenied is returned when the subscription plan disables custom screen layouts.
	ErrScreenLayoutTemplatePlanDenied = errors.New("custom screen layouts are not enabled for this plan")
	// ErrScreenLayoutTemplateInvalidDefinition is returned when definition JSON is empty or not an object.
	ErrScreenLayoutTemplateInvalidDefinition = errors.New("invalid template definition")
	ErrScreenLayoutTemplateInvalidSurface    = errors.New("invalid template surface")
	ErrScreenLayoutTemplateSurfaceImmutable  = errors.New("template surface is immutable")
	ErrScreenLayoutTemplateSurfaceMismatch   = errors.New("definition surface does not match template surface")

	ErrExperienceVersionConflict            = repository.ErrExperienceVersionConflict
	ErrExperienceAssignmentIncomplete       = repository.ErrExperienceAssignmentIncomplete
	ErrExperienceAssignmentIncompatible     = repository.ErrExperienceAssignmentIncompatible
	ErrExperienceTemplateUnpublished        = repository.ErrExperienceTemplateUnpublished
	ErrExperienceVariantNotFound            = repository.ErrExperienceVariantNotFound
	ErrExperiencePublishedDefinitionInvalid = repository.ErrExperiencePublishedDefinitionInvalid
	ErrExperienceTemplateNotFound           = errors.New("experience template not found")
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

func parseExperienceSurface(surface string, allowCreateDefault bool) (string, error) {
	if surface == "" && allowCreateDefault {
		return experience.SurfaceQueueDisplay, nil
	}
	switch surface {
	case experience.SurfaceTicketStation, experience.SurfaceQueueDisplay, experience.SurfaceCounterDisplay, experience.SurfaceVisitorMobile:
		return surface, nil
	default:
		return "", ErrScreenLayoutTemplateInvalidSurface
	}
}

func validateDraftObject(definition json.RawMessage) error {
	if len(definition) == 0 || !json.Valid(definition) {
		return ErrScreenLayoutTemplateInvalidDefinition
	}
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(definition, &probe); err != nil || probe == nil {
		return ErrScreenLayoutTemplateInvalidDefinition
	}
	return nil
}

func validateDeclaredSurface(definition json.RawMessage, expectedSurface string) error {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(definition, &probe); err != nil || probe == nil {
		return ErrScreenLayoutTemplateInvalidDefinition
	}
	rawSurface, exists := probe["surface"]
	if !exists {
		return nil
	}
	var declared string
	if err := json.Unmarshal(rawSurface, &declared); err != nil || declared != expectedSurface {
		return ErrScreenLayoutTemplateSurfaceMismatch
	}
	return nil
}

func (s *ScreenLayoutTemplateService) Create(companyID, name, surface string, definition json.RawMessage) (*models.ScreenLayoutTemplate, error) {
	if err := requireCustomScreenLayoutsPlan(companyID); err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name required")
	}
	normalizedSurface, err := parseExperienceSurface(surface, true)
	if err != nil {
		return nil, err
	}
	if err := validateDraftObject(definition); err != nil {
		return nil, err
	}
	if err := validateDeclaredSurface(definition, normalizedSurface); err != nil {
		return nil, err
	}
	row := &models.ScreenLayoutTemplate{
		CompanyID:  companyID,
		Name:       name,
		Surface:    normalizedSurface,
		Definition: definition,
	}
	if err := s.repo.Create(row); err != nil {
		return nil, err
	}
	return s.repo.GetByIDAndCompany(row.ID, companyID)
}

func (s *ScreenLayoutTemplateService) Update(companyID, id, name string, definition json.RawMessage, surface *string) (*models.ScreenLayoutTemplate, error) {
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
	if surface != nil {
		normalized, surfaceErr := parseExperienceSurface(*surface, false)
		if surfaceErr != nil {
			return nil, surfaceErr
		}
		if normalized != existing.Surface {
			return nil, ErrScreenLayoutTemplateSurfaceImmutable
		}
	}
	if err := validateDraftObject(definition); err != nil {
		return nil, err
	}
	if err := validateDeclaredSurface(definition, existing.Surface); err != nil {
		return nil, err
	}
	existing.Name = name
	existing.Definition = definition
	if err := s.repo.Update(existing); err != nil {
		return nil, err
	}
	return s.repo.GetByIDAndCompany(id, companyID)
}

func mapExperiencePublishError(err error) error {
	if err == nil {
		return nil
	}
	var validationErr *experience.ValidationError
	if errors.As(err, &validationErr) {
		return fmt.Errorf("%w: %v", ErrScreenLayoutTemplateInvalidDefinition, validationErr)
	}
	return err
}

// Publish validates and snapshots the locked draft, then atomically advances the published pointer.
func (s *ScreenLayoutTemplateService) Publish(ctx context.Context, companyID, templateID, publisherID string) (*models.ExperienceTemplateVersion, error) {
	if err := requireCustomScreenLayoutsPlan(companyID); err != nil {
		return nil, err
	}
	version, err := s.repo.Publish(ctx, companyID, templateID, publisherID)
	return version, mapExperiencePublishError(err)
}

func (s *ScreenLayoutTemplateService) ListVersions(ctx context.Context, companyID, templateID string) ([]models.ExperienceTemplateVersion, error) {
	return s.repo.ListVersions(ctx, companyID, templateID)
}

// Restore copies an owned immutable historical definition into a new latest version.
func (s *ScreenLayoutTemplateService) Restore(ctx context.Context, companyID, templateID, sourceVersionID, publisherID string) (*models.ExperienceTemplateVersion, error) {
	if err := requireCustomScreenLayoutsPlan(companyID); err != nil {
		return nil, err
	}
	version, err := s.repo.Restore(ctx, companyID, templateID, sourceVersionID, publisherID)
	return version, mapExperiencePublishError(err)
}

func (s *ScreenLayoutTemplateService) GetPublishedVersion(ctx context.Context, companyID, templateID string) (*models.ExperienceTemplateVersion, error) {
	return s.repo.GetPublishedVersion(ctx, companyID, templateID)
}

func (s *ScreenLayoutTemplateService) ResolveTerminalPublishedVersion(ctx context.Context, companyID, terminalID string) (*models.ExperienceTemplateVersion, string, error) {
	return s.repo.ResolveTerminalPublishedVersion(ctx, companyID, terminalID)
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
