package services

import (
	"encoding/json"
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ErrUnitQuotaExceeded is returned when the company's plan does not allow creating another subdivision.
var ErrUnitQuotaExceeded = errors.New("unit quota exceeded for current subscription plan")

// ErrZoneQuotaExceeded is returned when the parent subdivision has reached its zones_per_unit limit.
var ErrZoneQuotaExceeded = errors.New("service zone quota per subdivision exceeded for current subscription plan")

// Validation errors from CreateUnit / UpdateUnit (use errors.Is in HTTP handlers).
var (
	ErrInvalidUnitKind    = errors.New("invalid unit kind: use subdivision or service_zone")
	ErrParentNotFound     = errors.New("parent unit not found")
	ErrCrossCompanyParent = errors.New("parent unit belongs to another company")
	ErrInvalidParentKind  = errors.New("parent must be a subdivision or a service zone")
	ErrCycleDetected      = errors.New("cannot set parent: would create a cycle")
	// ErrUnitHasChildren is returned when deleting a unit that still has children (map to HTTP 409).
	ErrUnitHasChildren = errors.New("cannot delete unit that has child units")
)

type UnitService interface {
	CreateUnit(unit *models.Unit) error
	GetUnitsForCompany(companyID string) ([]models.Unit, error)
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

// UnitAnonymousEnsurer creates the per-unit synthetic "anonymous" client row after a unit is created.
type UnitAnonymousEnsurer interface {
	EnsureAnonymousClient(unitID string) error
	// EnsureAnonymousClientTx runs the same bootstrap on tx (caller owns the transaction).
	EnsureAnonymousClientTx(tx *gorm.DB, unitID string) error
}

type unitService struct {
	repo       repository.UnitRepository
	anonymous  UnitAnonymousEnsurer
	tenantRBAC repository.TenantRBACRepository
	quota      QuotaService
}

func NewUnitService(repo repository.UnitRepository, anonymous UnitAnonymousEnsurer, tenantRBAC repository.TenantRBACRepository) UnitService {
	return &unitService{repo: repo, anonymous: anonymous, tenantRBAC: tenantRBAC}
}

// NewUnitServiceWithQuota creates UnitService with quota enforcement enabled.
func NewUnitServiceWithQuota(repo repository.UnitRepository, anonymous UnitAnonymousEnsurer, tenantRBAC repository.TenantRBACRepository, quota QuotaService) UnitService {
	return &unitService{repo: repo, anonymous: anonymous, tenantRBAC: tenantRBAC, quota: quota}
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

// mergeDefaultKioskServiceGridLayoutAuto sets config.kiosk.serviceGridLayout to "auto" when missing
// so new units get automatic kiosk layout unless the client explicitly set another value.
func mergeDefaultKioskServiceGridLayoutAuto(config json.RawMessage) json.RawMessage {
	if len(config) == 0 {
		return json.RawMessage(`{"kiosk":{"serviceGridLayout":"auto"}}`)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(config, &m); err != nil {
		return config
	}
	rawK, hasK := m["kiosk"]
	if !hasK || len(rawK) == 0 || string(rawK) == "null" {
		m["kiosk"] = json.RawMessage(`{"serviceGridLayout":"auto"}`)
		out, err := json.Marshal(m)
		if err != nil {
			return config
		}
		return out
	}
	var k map[string]interface{}
	if err := json.Unmarshal(rawK, &k); err != nil {
		return config
	}
	if k == nil {
		m["kiosk"] = json.RawMessage(`{"serviceGridLayout":"auto"}`)
	} else if _, ok := k["serviceGridLayout"]; !ok {
		k["serviceGridLayout"] = "auto"
		kb, err := json.Marshal(k)
		if err != nil {
			return config
		}
		m["kiosk"] = json.RawMessage(kb)
	}
	out, err := json.Marshal(m)
	if err != nil {
		return config
	}
	return out
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

	unit.Config = mergeDefaultKioskServiceGridLayoutAuto(unit.Config)

	// Enforce quota limits when quota service is available.
	if s.quota != nil {
		switch unit.Kind {
		case models.UnitKindSubdivision:
			ok, err := s.quota.CheckQuota(unit.CompanyID, "units")
			if err != nil {
				return err
			}
			if !ok {
				return ErrUnitQuotaExceeded
			}
		case models.UnitKindServiceZone:
			if unit.ParentID != nil && *unit.ParentID != "" {
				ok, err := s.quota.CheckZonesPerUnit(*unit.ParentID, unit.CompanyID)
				if err != nil {
					return err
				}
				if !ok {
					return ErrZoneQuotaExceeded
				}
			}
		}
	}

	return s.repo.Transaction(func(tx *gorm.DB) error {
		if err := s.repo.CreateTx(tx, unit); err != nil {
			return err
		}
		if s.tenantRBAC != nil {
			if err := s.tenantRBAC.EnsureSystemTenantRoleTRUForUnitTx(tx, unit.CompanyID, unit.ID); err != nil {
				return err
			}
		}
		if s.anonymous != nil {
			if err := s.anonymous.EnsureAnonymousClientTx(tx, unit.ID); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *unitService) GetUnitsForCompany(companyID string) ([]models.Unit, error) {
	if companyID == "" {
		return nil, errors.New("companyId is required")
	}
	return s.repo.FindAllByCompanyID(companyID)
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
		return ErrUnitHasChildren
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
