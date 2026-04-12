package repository

import (
	"errors"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type OperatorIntervalRepository interface {
	InsertTx(tx *gorm.DB, row *models.CounterOperatorInterval) error
	CloseOpenIntervalsForCounterTx(tx *gorm.DB, counterID string, endAt time.Time) (int64, error)
	// CloseOpenIdleIntervalsForCounterTx sets ended_at only on open intervals with kind idle (not break).
	CloseOpenIdleIntervalsForCounterTx(tx *gorm.DB, counterID string, endAt time.Time) (int64, error)
	CloseOpenIntervalsForUnitTx(tx *gorm.DB, unitID string, endAt time.Time) (int64, error)
	HasOpenIntervalForCounterTx(tx *gorm.DB, counterID string) (bool, error)
	// GetOpenBreakStartTime returns startedAt for the open break interval on this counter, if any.
	GetOpenBreakStartTime(counterID string) (*time.Time, error)
}

type operatorIntervalRepository struct {
	db *gorm.DB
}

func NewOperatorIntervalRepository() OperatorIntervalRepository {
	return &operatorIntervalRepository{db: database.DB}
}

func (r *operatorIntervalRepository) InsertTx(tx *gorm.DB, row *models.CounterOperatorInterval) error {
	if tx == nil {
		return errors.New("nil tx for InsertTx")
	}
	return tx.Create(row).Error
}

func (r *operatorIntervalRepository) CloseOpenIntervalsForCounterTx(tx *gorm.DB, counterID string, endAt time.Time) (int64, error) {
	if tx == nil {
		return 0, errors.New("nil tx for CloseOpenIntervalsForCounterTx")
	}
	res := tx.Model(&models.CounterOperatorInterval{}).
		Where("counter_id = ? AND ended_at IS NULL", counterID).
		Update("ended_at", endAt)
	return res.RowsAffected, res.Error
}

func (r *operatorIntervalRepository) CloseOpenIdleIntervalsForCounterTx(tx *gorm.DB, counterID string, endAt time.Time) (int64, error) {
	if tx == nil {
		return 0, errors.New("nil tx for CloseOpenIdleIntervalsForCounterTx")
	}
	res := tx.Model(&models.CounterOperatorInterval{}).
		Where("counter_id = ? AND ended_at IS NULL AND kind = ?", counterID, models.OperatorIntervalKindIdle).
		Update("ended_at", endAt)
	return res.RowsAffected, res.Error
}

func (r *operatorIntervalRepository) CloseOpenIntervalsForUnitTx(tx *gorm.DB, unitID string, endAt time.Time) (int64, error) {
	if tx == nil {
		return 0, errors.New("nil tx for CloseOpenIntervalsForUnitTx")
	}
	res := tx.Model(&models.CounterOperatorInterval{}).
		Where("unit_id = ? AND ended_at IS NULL", unitID).
		Update("ended_at", endAt)
	return res.RowsAffected, res.Error
}

func (r *operatorIntervalRepository) HasOpenIntervalForCounterTx(tx *gorm.DB, counterID string) (bool, error) {
	if tx == nil {
		return false, errors.New("nil tx for HasOpenIntervalForCounterTx")
	}
	var n int64
	err := tx.Model(&models.CounterOperatorInterval{}).
		Where("counter_id = ? AND ended_at IS NULL", counterID).
		Count(&n).Error
	return n > 0, err
}

func (r *operatorIntervalRepository) GetOpenBreakStartTime(counterID string) (*time.Time, error) {
	var row models.CounterOperatorInterval
	err := r.db.Where("counter_id = ? AND kind = ? AND ended_at IS NULL", counterID, models.OperatorIntervalKindBreak).
		Order("started_at DESC").
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row.StartedAt, nil
}
