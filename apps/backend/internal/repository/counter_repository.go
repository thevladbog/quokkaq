package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type CounterRepository interface {
	Create(counter *models.Counter) error
	FindAllByUnit(unitID string) ([]models.Counter, error)
	FindByID(id string) (*models.Counter, error)
	FindByUserID(userID string) (*models.Counter, error)
	FindByUserIDTx(tx *gorm.DB, userID string) (*models.Counter, error)
	Update(counter *models.Counter) error
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

func (r *counterRepository) Create(counter *models.Counter) error {
	return r.db.Create(counter).Error
}

func (r *counterRepository) FindAllByUnit(unitID string) ([]models.Counter, error) {
	var counters []models.Counter
	err := r.db.Preload("AssignedUser").Where("unit_id = ?", unitID).Find(&counters).Error
	return counters, err
}

func (r *counterRepository) FindByID(id string) (*models.Counter, error) {
	var counter models.Counter
	err := r.db.First(&counter, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &counter, nil
}

func (r *counterRepository) FindByUserID(userID string) (*models.Counter, error) {
	return r.FindByUserIDTx(r.db, userID)
}

func (r *counterRepository) FindByUserIDTx(tx *gorm.DB, userID string) (*models.Counter, error) {
	var counter models.Counter
	err := tx.First(&counter, "assigned_to = ?", userID).Error
	if err != nil {
		return nil, err
	}
	return &counter, nil
}

func (r *counterRepository) Update(counter *models.Counter) error {
	return r.db.Save(counter).Error
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
	result := tx.Model(&models.Counter{}).
		Where("unit_id = ?", unitID).
		Update("assigned_to", nil)
	return result.RowsAffected, result.Error
}
