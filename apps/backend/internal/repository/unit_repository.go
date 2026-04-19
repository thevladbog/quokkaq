package repository

import (
	"encoding/json"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type UnitRepository interface {
	Transaction(fn func(tx *gorm.DB) error) error
	CreateTx(tx *gorm.DB, unit *models.Unit) error
	Create(unit *models.Unit) error
	FindAll() ([]models.Unit, error)
	// FindAllByCompanyID returns units for one tenant (company).
	FindAllByCompanyID(companyID string) ([]models.Unit, error)
	FindByID(id string) (*models.Unit, error)
	// FindByIDLight loads only the unit row (no relations). Use for updates/auth checks; use FindByID for API responses that need nested data.
	FindByIDLight(id string) (*models.Unit, error)
	Update(unit *models.Unit) error
	// UpdateConfig updates only the config JSONB column (no full Save — avoids wiping associations).
	UpdateConfig(unitID string, config json.RawMessage) error
	Delete(id string) error
	CountChildren(parentID string) (int64, error)
	FindChildSubdivisions(parentID string) ([]models.Unit, error)
	FindChildUnits(parentID string) ([]models.Unit, error)
	AddMaterial(material *models.UnitMaterial) error
	GetMaterials(unitID string) ([]models.UnitMaterial, error)
	DeleteMaterial(id string) error
	Count() (int64, error)
	CreateCompany(company *models.Company) error
	// FindFirstByCompanyIDTx returns the oldest unit for a company (used for SSO JIT provisioning).
	FindFirstByCompanyIDTx(tx *gorm.DB, companyID string) (*models.Unit, error)
}

type unitRepository struct {
	db *gorm.DB
}

func NewUnitRepository() UnitRepository {
	return &unitRepository{db: database.DB}
}

func (r *unitRepository) Transaction(fn func(tx *gorm.DB) error) error {
	return r.db.Transaction(fn)
}

func (r *unitRepository) CreateTx(tx *gorm.DB, unit *models.Unit) error {
	return tx.Create(unit).Error
}

func (r *unitRepository) Create(unit *models.Unit) error {
	return r.db.Create(unit).Error
}

func (r *unitRepository) FindAll() ([]models.Unit, error) {
	var units []models.Unit
	err := r.db.Find(&units).Error
	return units, err
}

func (r *unitRepository) FindAllByCompanyID(companyID string) ([]models.Unit, error) {
	var units []models.Unit
	err := r.db.Where("company_id = ?", companyID).Find(&units).Error
	return units, err
}

func (r *unitRepository) FindByID(id string) (*models.Unit, error) {
	var unit models.Unit
	err := r.db.Preload("Services").Preload("Counters").Preload("Tickets").First(&unit, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &unit, nil
}

func (r *unitRepository) FindByIDLight(id string) (*models.Unit, error) {
	var unit models.Unit
	err := r.db.First(&unit, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &unit, nil
}

func (r *unitRepository) Update(unit *models.Unit) error {
	// Map-based Updates so nil pointers (e.g. name_en, parent_id) are written as SQL NULL.
	// Save() can omit nil pointer fields on update.
	res := r.db.Model(&models.Unit{}).Where("id = ?", unit.ID).Updates(map[string]interface{}{
		"company_id": unit.CompanyID,
		"parent_id":  unit.ParentID,
		"code":       unit.Code,
		"kind":       unit.Kind,
		"sort_order": unit.SortOrder,
		"name":       unit.Name,
		"name_en":    unit.NameEn,
		"timezone":   unit.Timezone,
		"config":     unit.Config,
		"updated_at": time.Now(),
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *unitRepository) UpdateConfig(unitID string, config json.RawMessage) error {
	return r.db.Model(&models.Unit{}).Where("id = ?", unitID).Update("config", config).Error
}

func (r *unitRepository) Delete(id string) error {
	return r.db.Delete(&models.Unit{}, "id = ?", id).Error
}

func (r *unitRepository) CountChildren(parentID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.Unit{}).Where("parent_id = ?", parentID).Count(&count).Error
	return count, err
}

func (r *unitRepository) FindChildSubdivisions(parentID string) ([]models.Unit, error) {
	var units []models.Unit
	err := r.db.Where("parent_id = ? AND kind = ?", parentID, models.UnitKindSubdivision).
		Order("sort_order ASC, name ASC").
		Find(&units).Error
	return units, err
}

func (r *unitRepository) FindChildUnits(parentID string) ([]models.Unit, error) {
	var units []models.Unit
	err := r.db.Where("parent_id = ?", parentID).
		Order("sort_order ASC, name ASC").
		Find(&units).Error
	return units, err
}

func (r *unitRepository) AddMaterial(material *models.UnitMaterial) error {
	return r.db.Create(material).Error
}

func (r *unitRepository) GetMaterials(unitID string) ([]models.UnitMaterial, error) {
	var materials []models.UnitMaterial
	err := r.db.Where("unit_id = ?", unitID).Find(&materials).Error
	return materials, err
}

func (r *unitRepository) DeleteMaterial(id string) error {
	return r.db.Delete(&models.UnitMaterial{}, "id = ?", id).Error
}

func (r *unitRepository) Count() (int64, error) {
	var count int64
	err := r.db.Model(&models.Unit{}).Count(&count).Error
	return count, err
}

func (r *unitRepository) CreateCompany(company *models.Company) error {
	return r.db.Create(company).Error
}

func (r *unitRepository) FindFirstByCompanyIDTx(tx *gorm.DB, companyID string) (*models.Unit, error) {
	var unit models.Unit
	err := tx.Where("company_id = ?", companyID).Order("created_at ASC").First(&unit).Error
	if err != nil {
		return nil, err
	}
	return &unit, nil
}
