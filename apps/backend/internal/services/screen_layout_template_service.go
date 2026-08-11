package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/experience"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

var (
	// ErrScreenLayoutTemplatePlanDenied is returned when the subscription plan disables custom screen layouts.
	ErrScreenLayoutTemplatePlanDenied = errors.New("custom screen layouts are not enabled for this plan")
	// ErrScreenLayoutTemplateInvalidDefinition is returned when definition JSON is empty or not an object.
	ErrScreenLayoutTemplateInvalidDefinition  = errors.New("invalid template definition")
	ErrScreenLayoutTemplateDefinitionTooLarge = errors.New("template definition too large")
	ErrScreenLayoutTemplateInvalidSurface     = errors.New("invalid template surface")
	ErrScreenLayoutTemplateSurfaceImmutable   = errors.New("template surface is immutable")
	ErrScreenLayoutTemplateSurfaceMismatch    = errors.New("definition surface does not match template surface")

	ErrExperienceVersionConflict            = repository.ErrExperienceVersionConflict
	ErrExperienceAssignmentIncomplete       = repository.ErrExperienceAssignmentIncomplete
	ErrExperienceAssignmentIncompatible     = repository.ErrExperienceAssignmentIncompatible
	ErrExperienceTemplateUnpublished        = repository.ErrExperienceTemplateUnpublished
	ErrExperienceVariantNotFound            = repository.ErrExperienceVariantNotFound
	ErrExperiencePublishedDefinitionInvalid = repository.ErrExperiencePublishedDefinitionInvalid
	ErrExperienceTemplateNotFound           = errors.New("experience template not found")
	ErrExperienceVersionPaginationInvalid   = repository.ErrExperienceVersionPaginationInvalid
	ErrExperienceTemplateAssigned           = repository.ErrExperienceTemplateAssigned
)

const (
	DefaultExperienceVersionPageSize = 20
	MaxExperienceVersionPageSize     = 100

	TerminalExperienceModeLegacy     = "legacy"
	TerminalExperienceModeExperience = "experience"
)

// TerminalExperienceManifest is the bounded runtime projection of the current
// immutable published template for one terminal.
type TerminalExperienceManifest struct {
	Mode        string          `json:"mode"`
	TemplateID  string          `json:"templateId,omitempty"`
	VersionID   string          `json:"versionId,omitempty"`
	Version     int             `json:"version,omitempty"`
	VariantID   string          `json:"variantId,omitempty"`
	Definition  json.RawMessage `json:"definition,omitempty" swaggertype:"object"`
	PublishedAt *time.Time      `json:"publishedAt,omitempty"`
}

// ScreenLayoutTemplateService manages tenant screen layout templates.
type ScreenLayoutTemplateService struct {
	repo         repository.ScreenLayoutTemplateRepository
	terminalRepo repository.DesktopTerminalRepository
}

func NewScreenLayoutTemplateService(repo repository.ScreenLayoutTemplateRepository, terminalRepos ...repository.DesktopTerminalRepository) *ScreenLayoutTemplateService {
	var terminalRepo repository.DesktopTerminalRepository
	if len(terminalRepos) > 0 {
		terminalRepo = terminalRepos[0]
	}
	return &ScreenLayoutTemplateService{repo: repo, terminalRepo: terminalRepo}
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
	if len(definition) > experience.MaxDefinitionBytes {
		return ErrScreenLayoutTemplateDefinitionTooLarge
	}
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
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("name required")
	}
	if err := validateDraftObject(definition); err != nil {
		return nil, err
	}
	existing, err := s.repo.GetByIDAndCompany(id, companyID)
	if err != nil {
		return nil, err
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

func (s *ScreenLayoutTemplateService) ListVersions(ctx context.Context, companyID, templateID string, beforeVersion *int, limit int) (*models.ExperienceTemplateVersionPage, error) {
	if limit == 0 {
		limit = DefaultExperienceVersionPageSize
	}
	if limit < 1 || limit > MaxExperienceVersionPageSize || (beforeVersion != nil && *beforeVersion < 1) {
		return nil, ErrExperienceVersionPaginationInvalid
	}
	return s.repo.ListVersions(ctx, companyID, templateID, beforeVersion, limit)
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

// ResolveTerminalExperience projects only the terminal's current immutable
// published version. An entirely absent assignment deliberately stays on the
// legacy runtime; incomplete or no-longer-deployable assignments fail closed.
func (s *ScreenLayoutTemplateService) ResolveTerminalExperience(ctx context.Context, terminalID string) (*TerminalExperienceManifest, error) {
	if s.terminalRepo == nil {
		return nil, errors.New("terminal repository is not configured")
	}
	terminal, err := s.terminalRepo.FindActiveByID(ctx, terminalID)
	if err != nil {
		return nil, err
	}
	if models.EffectiveTerminalKind(terminal) != models.DesktopTerminalKindKiosk {
		return nil, ErrExperienceAssignmentIncompatible
	}
	if terminal.ExperienceTemplateID == nil && terminal.ExperienceVariantID == nil {
		return &TerminalExperienceManifest{Mode: TerminalExperienceModeLegacy}, nil
	}
	if terminal.ExperienceTemplateID == nil || terminal.ExperienceVariantID == nil {
		return nil, ErrExperienceAssignmentIncomplete
	}
	version, variantID, err := s.repo.ResolveTerminalPublishedVersion(ctx, terminal.Unit.CompanyID, terminal.ID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrExperienceTemplateUnpublished
	}
	if err != nil {
		return nil, err
	}
	publishedAt := version.PublishedAt
	return &TerminalExperienceManifest{
		Mode:        TerminalExperienceModeExperience,
		TemplateID:  version.TemplateID,
		VersionID:   version.ID,
		Version:     version.Version,
		VariantID:   variantID,
		Definition:  version.Definition,
		PublishedAt: &publishedAt,
	}, nil
}

// AcknowledgeTerminalExperience delegates the compare-and-update to the
// terminal repository, where the terminal and published-template rows are
// locked together. A rejected acknowledgement intentionally preserves the
// last successful applied version for operational history.
func (s *ScreenLayoutTemplateService) AcknowledgeTerminalExperience(ctx context.Context, terminalID, versionID, status string, reasonCode *string) error {
	if s.terminalRepo == nil {
		return errors.New("terminal repository is not configured")
	}
	return s.terminalRepo.AcknowledgeExperience(ctx, terminalID, versionID, status, reasonCode)
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
