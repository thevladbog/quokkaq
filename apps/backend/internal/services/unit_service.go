package services

import (
	"encoding/json"
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Validation errors from CreateUnit / UpdateUnit (use errors.Is in HTTP handlers).
var (
	ErrInvalidUnitKind    = errors.New("invalid unit kind: use subdivision or service_zone")
	ErrParentNotFound     = errors.New("parent unit not found")
	ErrCrossCompanyParent = errors.New("parent unit belongs to another company")
	ErrInvalidParentKind  = errors.New("parent must be a subdivision or a service zone")
	ErrCycleDetected      = errors.New("cannot set parent: would create a cycle")
)

type UnitService interface {
	CreateUnit(unit *models.Unit) error
	GetAllUnits() ([]models.Unit, error)
	GetUnitByID(id string) (*models.Unit, error)
	GetChildSubdivisions(parentID string) ([]models.Unit, error)
	GetChildUnits(parentID string) ([]models.Unit, error)
	UpdateUnit(unit *models.Unit) error
	DeleteUnit(id string) error
	AddMaterial(material *models.UnitMaterial) error
	GetMaterials(unitID string) ([]models.UnitMaterial, error)
	DeleteMaterial(id string) error
	UpdateAdSettings(unitID string, settings map[string]interface{}) error
}

type unitService struct {
	repo repository.UnitRepository
}

func NewUnitService(repo repository.UnitRepository) UnitService {
	return &unitService{repo: repo}
}

func normalizeUnitKind(kind string) string {
	if kind == "" {
		return models.UnitKindSubdivision
	}
	return kind
}

func validateUnitKind(kind string) error {
	switch kind {
	case models.UnitKindServiceZone, models.UnitKindSubdivision:
		return nil
	default:
		return ErrInvalidUnitKind
	}
}

// wouldCreateCycle is true if newParent is the unit itself or an ancestor of unitID would include unitID when walking up from newParent.
func (s *unitService) wouldCreateCycle(unitID string, newParentID *string) (bool, error) {
	if newParentID == nil || *newParentID == "" || unitID == "" {
		return false, nil
	}
	visited := make(map[string]struct{})
	cur := newParentID
	for cur != nil && *cur != "" {
		if *cur == unitID {
			return true, nil
		}
		if _, seen := visited[*cur]; seen {
			return true, nil
		}
		visited[*cur] = struct{}{}
		p, err := s.repo.FindByIDLight(*cur)
		if err != nil {
			return false, err
		}
		cur = p.ParentID
	}
	return false, nil
}

func (s *unitService) validateHierarchy(unitID, companyID string, parentID *string) error {
	if parentID == nil || *parentID == "" {
		return nil
	}
	parent, err := s.repo.FindByIDLight(*parentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrParentNotFound
		}
		return err
	}
	if parent.CompanyID != companyID {
		return ErrCrossCompanyParent
	}
	if !models.UnitKindAllowsChildUnits(parent.Kind) {
		return ErrInvalidParentKind
	}
	if unitID != "" {
		cycle, err := s.wouldCreateCycle(unitID, parentID)
		if err != nil {
			return err
		}
		if cycle {
			return ErrCycleDetected
		}
	}
	return nil
}

func (s *unitService) CreateUnit(unit *models.Unit) error {
	if unit.CompanyID == "" {
		count, err := s.repo.Count()
		if err != nil {
			return err
		}

		if count == 0 {
			company := &models.Company{
				ID:   uuid.New().String(),
				Name: "Default Company",
			}
			if err := s.repo.CreateCompany(company); err != nil {
				return err
			}
			unit.CompanyID = company.ID
		} else {
			return errors.New("companyId is required")
		}
	}
	if unit.Timezone == "" {
		unit.Timezone = "UTC"
	}
	unit.Kind = normalizeUnitKind(unit.Kind)
	if err := validateUnitKind(unit.Kind); err != nil {
		return err
	}
	if err := s.validateHierarchy("", unit.CompanyID, unit.ParentID); err != nil {
		return err
	}
	return s.repo.Create(unit)
}

func (s *unitService) GetAllUnits() ([]models.Unit, error) {
	return s.repo.FindAll()
}

func (s *unitService) GetUnitByID(id string) (*models.Unit, error) {
	return s.repo.FindByID(id)
}

func (s *unitService) GetChildSubdivisions(parentID string) ([]models.Unit, error) {
	return s.repo.FindChildSubdivisions(parentID)
}

func (s *unitService) GetChildUnits(parentID string) ([]models.Unit, error) {
	return s.repo.FindChildUnits(parentID)
}

func (s *unitService) UpdateUnit(unit *models.Unit) error {
	stored, err := s.repo.FindByIDLight(unit.ID)
	if err != nil {
		return err
	}
	// Only normalize/validate when the client is changing kind; legacy DB values
	// (e.g. historical leaf kinds) stay valid on PATCH that does not touch kind.
	if unit.Kind != stored.Kind {
		unit.Kind = normalizeUnitKind(unit.Kind)
		if err := validateUnitKind(unit.Kind); err != nil {
			return err
		}
	}
	if err := s.validateHierarchy(unit.ID, unit.CompanyID, unit.ParentID); err != nil {
		return err
	}
	return s.repo.Update(unit)
}

func (s *unitService) DeleteUnit(id string) error {
	n, err := s.repo.CountChildren(id)
	if err != nil {
		return err
	}
	if n > 0 {
		return errors.New("cannot delete unit that has child units")
	}
	return s.repo.Delete(id)
}

func (s *unitService) AddMaterial(material *models.UnitMaterial) error {
	return s.repo.AddMaterial(material)
}

func (s *unitService) GetMaterials(unitID string) ([]models.UnitMaterial, error) {
	return s.repo.GetMaterials(unitID)
}

func (s *unitService) DeleteMaterial(id string) error {
	return s.repo.DeleteMaterial(id)
}

func (s *unitService) UpdateAdSettings(unitID string, settings map[string]interface{}) error {
	bytes, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return s.repo.UpdateConfig(unitID, json.RawMessage(bytes))
}
