package repository

import (
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// StatisticsTicketSegmentsRepository holds read paths used by statistics rollups
// for queue wait / SLA and in-service time (ticket id lists + batch hydration).
type StatisticsTicketSegmentsRepository interface {
	ListTicketIDsCalledInRangeForWait(unitID string, startUTC, endUTC time.Time, zoneID string) ([]string, error)
	ListTicketIDsNoShowClosedInRangeForWait(unitID string, startUTC, endUTC time.Time, zoneID string) ([]string, error)
	ListTicketIDsServedCompletedInRangeForService(unitID string, startUTC, endUTC time.Time, zoneID string) ([]string, error)
	BatchTicketsByIDs(ids []string) (map[string]models.Ticket, error)
	BatchHistoriesByTicketIDs(ids []string) (map[string][]models.TicketHistory, error)
}

type statisticsTicketSegmentsRepository struct {
	db *gorm.DB
}

func NewStatisticsTicketSegmentsRepository() StatisticsTicketSegmentsRepository {
	return &statisticsTicketSegmentsRepository{db: database.DB}
}

// NewStatisticsTicketSegmentsRepositoryWithDB binds reads to db (e.g. a transaction).
func NewStatisticsTicketSegmentsRepositoryWithDB(db *gorm.DB) StatisticsTicketSegmentsRepository {
	return &statisticsTicketSegmentsRepository{db: db}
}

func statisticsZoneSQLArgs(zoneID string) (z1, z2 interface{}) {
	if strings.TrimSpace(zoneID) == "" {
		return nil, nil
	}
	z := strings.TrimSpace(zoneID)
	return z, z
}

func (r *statisticsTicketSegmentsRepository) ListTicketIDsCalledInRangeForWait(
	unitID string,
	startUTC, endUTC time.Time,
	zoneID string,
) ([]string, error) {
	z1, z2 := statisticsZoneSQLArgs(zoneID)
	var ticketIDs []string
	q := `
SELECT id::text FROM tickets
WHERE unit_id = ?
  AND called_at IS NOT NULL
  AND called_at >= ? AND called_at < ?
  AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
`
	if err := r.db.Raw(q, unitID, startUTC, endUTC, z1, z2).Scan(&ticketIDs).Error; err != nil {
		return nil, err
	}
	return ticketIDs, nil
}

func (r *statisticsTicketSegmentsRepository) ListTicketIDsNoShowClosedInRangeForWait(
	unitID string,
	startUTC, endUTC time.Time,
	zoneID string,
) ([]string, error) {
	z1, z2 := statisticsZoneSQLArgs(zoneID)
	var noCallIDs []string
	q := `
SELECT id::text FROM tickets
WHERE unit_id = ?
  AND called_at IS NULL
  AND completed_at IS NOT NULL
  AND completed_at >= ? AND completed_at < ?
  AND status = 'no_show'
  AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
`
	if err := r.db.Raw(q, unitID, startUTC, endUTC, z1, z2).Scan(&noCallIDs).Error; err != nil {
		return nil, err
	}
	return noCallIDs, nil
}

func (r *statisticsTicketSegmentsRepository) ListTicketIDsServedCompletedInRangeForService(
	unitID string,
	startUTC, endUTC time.Time,
	zoneID string,
) ([]string, error) {
	z1, z2 := statisticsZoneSQLArgs(zoneID)
	var ids []string
	q := `
SELECT id::text FROM tickets
WHERE unit_id = ?
  AND status = 'served'
  AND completed_at IS NOT NULL
  AND completed_at >= ? AND completed_at < ?
  AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
`
	if err := r.db.Raw(q, unitID, startUTC, endUTC, z1, z2).Scan(&ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (r *statisticsTicketSegmentsRepository) BatchTicketsByIDs(ids []string) (map[string]models.Ticket, error) {
	out := make(map[string]models.Ticket)
	if len(ids) == 0 {
		return out, nil
	}
	var rows []models.Ticket
	if err := r.db.Where("id IN ?", ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		out[rows[i].ID] = rows[i]
	}
	return out, nil
}

func (r *statisticsTicketSegmentsRepository) BatchHistoriesByTicketIDs(ids []string) (map[string][]models.TicketHistory, error) {
	out := make(map[string][]models.TicketHistory)
	if len(ids) == 0 {
		return out, nil
	}
	var rows []models.TicketHistory
	if err := r.db.Where("ticket_id IN ?", ids).Order("ticket_id ASC, created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		tid := rows[i].TicketID
		out[tid] = append(out[tid], rows[i])
	}
	return out, nil
}
