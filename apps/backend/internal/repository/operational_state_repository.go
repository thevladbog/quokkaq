package repository

import (
	"errors"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OperationalStateRepository interface {
	Get(unitID string) (*models.UnitOperationalState, error)
	Upsert(state *models.UnitOperationalState) error
	EnsureRow(unitID string) error
}

type operationalStateRepository struct {
	db *gorm.DB
}

func NewOperationalStateRepository() OperationalStateRepository {
	return &operationalStateRepository{db: database.DB}
}

func (r *operationalStateRepository) Get(unitID string) (*models.UnitOperationalState, error) {
	var row models.UnitOperationalState
	err := r.db.Where("unit_id = ?", unitID).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &models.UnitOperationalState{UnitID: unitID, Phase: "idle"}, nil
		}
		return nil, err
	}
	return &row, nil
}

func (r *operationalStateRepository) EnsureRow(unitID string) error {
	row := models.UnitOperationalState{UnitID: unitID, Phase: "idle"}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "unit_id"}},
		DoNothing: true,
	}).Create(&row).Error
}

func (r *operationalStateRepository) Upsert(state *models.UnitOperationalState) error {
	if state.UnitID == "" {
		return errors.New("unit id required")
	}
	row := *state
	row.UpdatedAt = time.Now().UTC()
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "unit_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"phase", "kiosk_frozen", "counter_login_blocked", "statistics_quiet",
			"reconcile_in_progress", "reconcile_progress_note",
			"last_eod_at", "last_reconcile_at", "last_reconcile_error", "statistics_as_of", "updated_at",
		}),
	}).Create(&row).Error
}
