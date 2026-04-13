package repository

import (
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type CounterRepository interface {
	Transaction(fn func(tx *gorm.DB) error) error
	Create(counter *models.Counter) error
	FindAllByUnit(unitID string) ([]models.Counter, error)
	FindByID(id string) (*models.Counter, error)
	// FindMapByIDs returns counters keyed by id; missing rows are omitted.
	FindMapByIDs(ids []string) (map[string]*models.Counter, error)
	FindByIDTx(tx *gorm.DB, id string) (*models.Counter, error)
	FindByIDForUpdateTx(tx *gorm.DB, id string) (*models.Counter, error)
	FindByUserID(userID string) (*models.Counter, error)
	FindByUserIDTx(tx *gorm.DB, userID string) (*models.Counter, error)
	Update(counter *models.Counter) error
	UpdateTx(tx *gorm.DB, counter *models.Counter) error
	UpdatePartial(id string, updates map[string]interface{}) error
	Delete(id string) error

	// Shift related
	CountActive(unitID string) (int64, error)
	ReleaseAll(unitID string) (int64, error)
	ReleaseAllTx(tx *gorm.DB, unitID string) (int64, error)
}

type counterRepository struct {
	db *gorm.DB
}

func NewCounterRepository() CounterRepository {
	return &counterRepository{db: database.DB}
}

func (r *counterRepository) Transaction(fn func(tx *gorm.DB) error) error {
	return r.db.Transaction(fn)
}

func (r *counterRepository) Create(counter *models.Counter) error {
	return r.db.Create(counter).Error
}

func (r *counterRepository) FindAllByUnit(unitID string) ([]models.Counter, error) {
	var counters []models.Counter
	err := r.db.Preload("AssignedUser").Where("unit_id = ?", unitID).Find(&counters).Error
	return counters, err
}

func (r *counterRepository) FindByID(id string) (*models.Counter, error) {
	return r.FindByIDTx(r.db, id)
}

func (r *counterRepository) FindMapByIDs(ids []string) (map[string]*models.Counter, error) {
	out := make(map[string]*models.Counter)
	if len(ids) == 0 {
		return out, nil
	}
	uniq := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		uniq = append(uniq, id)
	}
	if len(uniq) == 0 {
		return out, nil
	}
	var list []models.Counter
	if err := r.db.Where("id IN ?", uniq).Find(&list).Error; err != nil {
		return nil, err
	}
	for i := range list {
		c := list[i]
		cp := c
		out[c.ID] = &cp
	}
	return out, nil
}

func (r *counterRepository) FindByIDTx(tx *gorm.DB, id string) (*models.Counter, error) {
	if tx == nil {
		return nil, errors.New("nil tx provided to FindByIDTx")
	}
	var counter models.Counter
	err := tx.First(&counter, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &counter, nil
}

func (r *counterRepository) FindByIDForUpdateTx(tx *gorm.DB, id string) (*models.Counter, error) {
	if tx == nil {
		return nil, errors.New("nil tx provided to FindByIDForUpdateTx")
	}
	var counter models.Counter
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&counter, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &counter, nil
}

func (r *counterRepository) FindByUserID(userID string) (*models.Counter, error) {
	return r.FindByUserIDTx(r.db, userID)
}

func (r *counterRepository) FindByUserIDTx(tx *gorm.DB, userID string) (*models.Counter, error) {
	if tx == nil {
		return nil, errors.New("nil tx provided to FindByUserIDTx")
	}
	var counter models.Counter
	err := tx.First(&counter, "assigned_to = ?", userID).Error
	if err != nil {
		return nil, err
	}
	return &counter, nil
}

func (r *counterRepository) Update(counter *models.Counter) error {
	return r.UpdateTx(r.db, counter)
}

func (r *counterRepository) UpdateTx(tx *gorm.DB, counter *models.Counter) error {
	if tx == nil {
		return errors.New("nil tx provided to UpdateTx")
	}
	return tx.Save(counter).Error
}

func (r *counterRepository) UpdatePartial(id string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.Model(&models.Counter{}).Where("id = ?", id).Updates(updates).Error
}

func (r *counterRepository) Delete(id string) error {
	return r.db.Delete(&models.Counter{}, "id = ?", id).Error
}

func (r *counterRepository) CountActive(unitID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.Counter{}).
		Where("unit_id = ? AND assigned_to IS NOT NULL", unitID).
		Count(&count).Error
	return count, err
}

func (r *counterRepository) ReleaseAll(unitID string) (int64, error) {
	return r.ReleaseAllTx(r.db, unitID)
}

func (r *counterRepository) ReleaseAllTx(tx *gorm.DB, unitID string) (int64, error) {
	if tx == nil {
		return 0, errors.New("nil tx provided to ReleaseAllTx")
	}
	result := tx.Model(&models.Counter{}).
		Where("unit_id = ?", unitID).
		Updates(map[string]interface{}{
			"assigned_to": nil,
			"on_break":    false,
		})
	return result.RowsAffected, result.Error
}
