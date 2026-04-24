package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"

	"gorm.io/gorm"
)

// KioskETACalibrationService rebuilds p50/p90 from historical wait times (5.2).
type KioskETACalibrationService struct {
	db       *gorm.DB
	unitRepo repository.UnitRepository
}

// NewKioskETACalibrationService constructs the service.
func NewKioskETACalibrationService(db *gorm.DB, unitRepo repository.UnitRepository) *KioskETACalibrationService {
	return &KioskETACalibrationService{db: db, unitRepo: unitRepo}
}

// RefreshForUnit overwrites all slots for a unit; requires at least 3 samples per (service,dow,hour) bucket.
func (s *KioskETACalibrationService) RefreshForUnit(unitID string) error {
	if s.db == nil {
		return fmt.Errorf("kiosk eta calibration: no db")
	}
	u, err := s.unitRepo.FindByIDLight(unitID)
	if err != nil {
		return err
	}
	tz := "UTC"
	if u != nil && strings.TrimSpace(u.Timezone) != "" {
		tz = strings.TrimSpace(u.Timezone)
	}
	san := strings.ReplaceAll(tz, "'", "''")
	since := time.Now().UTC().AddDate(0, 0, -60)
	//nolint:gosec
	//nolint:gosec // sql uses sanitized IANA name only
	sql := fmt.Sprintf(`
INSERT INTO kiosk_eta_slot_calibration
  (id, unit_id, service_id, day_of_week, hour, p50_wait_sec, p90_wait_sec, p95_wait_sec, sample_n, updated_at)
SELECT gen_random_uuid(),
       t.unit_id,
       t.service_id,
       (EXTRACT(DOW FROM t.created_at AT TIME ZONE 'UTC' AT TIME ZONE '%s')::int)::smallint,
       (EXTRACT(HOUR FROM t.created_at AT TIME ZONE 'UTC' AT TIME ZONE '%s')::int)::smallint,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.called_at - t.created_at))::bigint))::int,
       (percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.called_at - t.created_at))::bigint))::int,
       (percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (t.called_at - t.created_at))::bigint))::int,
       (count(*))::int,
       now()
FROM tickets t
WHERE t.unit_id = $1
  AND t.called_at IS NOT NULL
  AND t.created_at < t.called_at
  AND t.created_at >= $2
GROUP BY
  t.unit_id,
  t.service_id,
  (EXTRACT(DOW FROM t.created_at AT TIME ZONE 'UTC' AT TIME ZONE '%s')::int),
  (EXTRACT(HOUR FROM t.created_at AT TIME ZONE 'UTC' AT TIME ZONE '%s')::int)
HAVING count(*) >= 3
`, san, san, san, san)
	if err := s.db.Exec("DELETE FROM kiosk_eta_slot_calibration WHERE unit_id = $1", unitID).Error; err != nil {
		return err
	}
	if err := s.db.Exec(sql, unitID, since).Error; err != nil {
		return err
	}
	return trainKioskGbmArtifact(s.db, unitID)
}

// trainKioskGbmArtifact stores default ensemble weights; slot-level p50/p90/p95 are in kiosk_eta_slot_calibration.
// Weights: [wBaseline, wP50, wP90, wP95] for the blended ETA in ETAService.
func trainKioskGbmArtifact(db *gorm.DB, unitID string) error {
	if db == nil {
		return nil
	}
	w := []float64{0.35, 0.25, 0.2, 0.2}
	var n int64
	_ = db.Model(&models.KioskETASlotCalibration{}).Where("unit_id = ?", unitID).Count(&n)
	if n < 1 {
		w = []float64{0.4, 0.2, 0.2, 0.2}
	}
	raw, err := json.Marshal(w)
	if err != nil {
		return err
	}
	art := models.KioskETAGBDTArtifact{UnitID: unitID, Weights: raw}
	return db.Save(&art).Error
}
