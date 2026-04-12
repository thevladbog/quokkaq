package repository

import (
	"errors"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// VisitorTagDefinitionRepository persists unit-scoped visitor tag definitions.
type VisitorTagDefinitionRepository interface {
	ListByUnit(unitID string) ([]models.UnitVisitorTagDefinition, error)
	GetByID(id string) (*models.UnitVisitorTagDefinition, error)
	GetByIDTx(tx *gorm.DB, id string) (*models.UnitVisitorTagDefinition, error)
	Create(row *models.UnitVisitorTagDefinition) error
	Update(row *models.UnitVisitorTagDefinition) error
	Delete(id string) error
	// CountInUnitWithIDs returns how many of the given IDs exist and belong to the unit.
	CountInUnitWithIDs(unitID string, ids []string) (int64, error)
	// ListByIDsInUnitTx returns definitions for the given ids that belong to the unit (empty slice if ids is empty).
	ListByIDsInUnitTx(tx *gorm.DB, unitID string, ids []string) ([]models.UnitVisitorTagDefinition, error)
}

type visitorTagDefinitionRepository struct {
	db *gorm.DB
}

func NewVisitorTagDefinitionRepository() VisitorTagDefinitionRepository {
	return &visitorTagDefinitionRepository{db: database.DB}
}

func (r *visitorTagDefinitionRepository) ListByUnit(unitID string) ([]models.UnitVisitorTagDefinition, error) {
	var rows []models.UnitVisitorTagDefinition
	err := r.db.Where("unit_id = ?", unitID).Order("sort_order ASC, label ASC").Find(&rows).Error
	return rows, err
}

func (r *visitorTagDefinitionRepository) GetByID(id string) (*models.UnitVisitorTagDefinition, error) {
	return r.GetByIDTx(r.db, id)
}

func (r *visitorTagDefinitionRepository) GetByIDTx(tx *gorm.DB, id string) (*models.UnitVisitorTagDefinition, error) {
	if tx == nil {
		return nil, errors.New("nil tx in GetByIDTx")
	}
	var row models.UnitVisitorTagDefinition
	err := tx.First(&row, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *visitorTagDefinitionRepository) Create(row *models.UnitVisitorTagDefinition) error {
	return r.db.Create(row).Error
}

func (r *visitorTagDefinitionRepository) Update(row *models.UnitVisitorTagDefinition) error {
	return r.db.Save(row).Error
}

func (r *visitorTagDefinitionRepository) Delete(id string) error {
	return r.db.Delete(&models.UnitVisitorTagDefinition{}, "id = ?", id).Error
}

func (r *visitorTagDefinitionRepository) CountInUnitWithIDs(unitID string, ids []string) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	var n int64
	err := r.db.Model(&models.UnitVisitorTagDefinition{}).
		Where("unit_id = ? AND id IN ?", unitID, ids).
		Count(&n).Error
	return n, err
}

func (r *visitorTagDefinitionRepository) ListByIDsInUnitTx(tx *gorm.DB, unitID string, ids []string) ([]models.UnitVisitorTagDefinition, error) {
	if len(ids) == 0 {
		return []models.UnitVisitorTagDefinition{}, nil
	}
	if tx == nil {
		return nil, errors.New("nil tx in ListByIDsInUnitTx")
	}
	var rows []models.UnitVisitorTagDefinition
	err := tx.Where("unit_id = ? AND id IN ?", unitID, ids).
		Order("label ASC").
		Find(&rows).Error
	return rows, err
}
