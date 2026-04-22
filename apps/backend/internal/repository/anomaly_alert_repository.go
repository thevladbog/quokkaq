package repository

import (
	"context"
	"errors"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// AnomalyAlertRepository persists and lists anomaly_alerts rows.
type AnomalyAlertRepository interface {
	Create(ctx context.Context, row *models.AnomalyAlert) error
	ListByUnit(ctx context.Context, unitID string, limit int) ([]models.AnomalyAlert, error)
}

type anomalyAlertRepository struct {
	db *gorm.DB
}

func NewAnomalyAlertRepository() AnomalyAlertRepository {
	return &anomalyAlertRepository{db: database.DB}
}

func (r *anomalyAlertRepository) Create(ctx context.Context, row *models.AnomalyAlert) error {
	if row == nil || strings.TrimSpace(row.UnitID) == "" {
		return errors.New("anomaly alert: missing unit")
	}
	return r.db.WithContext(ctx).Create(row).Error
}

func (r *anomalyAlertRepository) ListByUnit(ctx context.Context, unitID string, limit int) ([]models.AnomalyAlert, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var rows []models.AnomalyAlert
	err := r.db.WithContext(ctx).
		Where("unit_id::text = ?", unitID).
		Order("created_at DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}
