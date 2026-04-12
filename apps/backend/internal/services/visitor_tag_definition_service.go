package services

import (
	"errors"
	"regexp"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

var (
	// ErrVisitorTagInvalidColor is returned when color is not #RRGGBB (optional leading #).
	ErrVisitorTagInvalidColor = errors.New("invalid tag color (expected #RRGGBB)")
	// ErrVisitorTagLabelRequired is returned when label is empty after trim.
	ErrVisitorTagLabelRequired = errors.New("label is required")
)

var tagColorHexRE = regexp.MustCompile(`^#?[0-9A-Fa-f]{6}$`)

func normalizeVisitorTagColor(s string) (string, error) {
	s = strings.TrimSpace(s)
	if !tagColorHexRE.MatchString(s) {
		return "", ErrVisitorTagInvalidColor
	}
	if !strings.HasPrefix(s, "#") {
		s = "#" + s
	}
	return "#" + strings.ToUpper(s[1:]), nil
}

// VisitorTagDefinitionService manages unit-scoped visitor tag definitions.
type VisitorTagDefinitionService interface {
	ListByUnit(unitID string) ([]models.UnitVisitorTagDefinition, error)
	Create(unitID, label, color string, sortOrder *int) (*models.UnitVisitorTagDefinition, error)
	Update(unitID, definitionID string, label, color *string, sortOrder *int) (*models.UnitVisitorTagDefinition, error)
	Delete(unitID, definitionID string) error
}

type visitorTagDefinitionService struct {
	repo repository.VisitorTagDefinitionRepository
}

func NewVisitorTagDefinitionService(repo repository.VisitorTagDefinitionRepository) VisitorTagDefinitionService {
	return &visitorTagDefinitionService{repo: repo}
}

func (s *visitorTagDefinitionService) ListByUnit(unitID string) ([]models.UnitVisitorTagDefinition, error) {
	return s.repo.ListByUnit(unitID)
}

func (s *visitorTagDefinitionService) Create(unitID, label, color string, sortOrder *int) (*models.UnitVisitorTagDefinition, error) {
	l := strings.TrimSpace(label)
	if l == "" {
		return nil, ErrVisitorTagLabelRequired
	}
	col, err := normalizeVisitorTagColor(color)
	if err != nil {
		return nil, err
	}
	so := 0
	if sortOrder != nil {
		so = *sortOrder
	}
	row := &models.UnitVisitorTagDefinition{
		UnitID:    unitID,
		Label:     l,
		Color:     col,
		SortOrder: so,
	}
	if err := s.repo.Create(row); err != nil {
		return nil, err
	}
	return row, nil
}

func (s *visitorTagDefinitionService) Update(unitID, definitionID string, label, color *string, sortOrder *int) (*models.UnitVisitorTagDefinition, error) {
	row, err := s.repo.GetByID(definitionID)
	if err != nil {
		return nil, err
	}
	if row.UnitID != unitID {
		return nil, gorm.ErrRecordNotFound
	}
	if label != nil {
		l := strings.TrimSpace(*label)
		if l == "" {
			return nil, ErrVisitorTagLabelRequired
		}
		row.Label = l
	}
	if color != nil {
		col, err := normalizeVisitorTagColor(*color)
		if err != nil {
			return nil, err
		}
		row.Color = col
	}
	if sortOrder != nil {
		row.SortOrder = *sortOrder
	}
	if err := s.repo.Update(row); err != nil {
		return nil, err
	}
	return row, nil
}

func (s *visitorTagDefinitionService) Delete(unitID, definitionID string) error {
	row, err := s.repo.GetByID(definitionID)
	if err != nil {
		return err
	}
	if row.UnitID != unitID {
		return gorm.ErrRecordNotFound
	}
	return s.repo.Delete(definitionID)
}
