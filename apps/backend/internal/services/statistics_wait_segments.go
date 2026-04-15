package services

import (
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ticketaudit"

	"gorm.io/gorm"
)

// computeWaitSLAForTicketsCalledInRange aggregates queue wait (ms) and SLA for:
//   - tickets whose qualifying call falls in [startUTC, endUTC); and
//   - tickets never called but closed as no_show with completed_at in [startUTC, endUTC) (e.g. EOD queue sweep).
//
// Wait duration uses the segment after the last ticket.transferred strictly before the end instant (call or closure).
func computeWaitSLAForTicketsCalledInRange(
	db *gorm.DB,
	unitID string,
	startUTC, endUTC time.Time,
	zoneID string,
) (waitSumMs int64, waitCount int, slaMet int, slaTotal int, err error) {
	var z1, z2 interface{}
	if strings.TrimSpace(zoneID) == "" {
		z1, z2 = nil, nil
	} else {
		z := strings.TrimSpace(zoneID)
		z1, z2 = z, z
	}
	var ticketIDs []string
	q := `
SELECT id::text FROM tickets
WHERE unit_id = ?
  AND called_at IS NOT NULL
  AND called_at >= ? AND called_at < ?
  AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
`
	if err := db.Raw(q, unitID, startUTC, endUTC, z1, z2).Scan(&ticketIDs).Error; err != nil {
		return 0, 0, 0, 0, err
	}
	for _, tid := range ticketIDs {
		ws, wc, sm, st, err := waitSLAOneTicket(db, tid)
		if err != nil {
			return 0, 0, 0, 0, err
		}
		waitSumMs += ws
		waitCount += wc
		slaMet += sm
		slaTotal += st
	}

	var noCallIDs []string
	q2 := `
SELECT id::text FROM tickets
WHERE unit_id = ?
  AND called_at IS NULL
  AND completed_at IS NOT NULL
  AND completed_at >= ? AND completed_at < ?
  AND status = 'no_show'
  AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
`
	if err := db.Raw(q2, unitID, startUTC, endUTC, z1, z2).Scan(&noCallIDs).Error; err != nil {
		return 0, 0, 0, 0, err
	}
	for _, tid := range noCallIDs {
		ws, wc, sm, st, err := waitSLANoCallClosureOneTicket(db, tid)
		if err != nil {
			return 0, 0, 0, 0, err
		}
		waitSumMs += ws
		waitCount += wc
		slaMet += sm
		slaTotal += st
	}
	return waitSumMs, waitCount, slaMet, slaTotal, nil
}

func waitSLAOneTicket(db *gorm.DB, ticketID string) (waitSumMs int64, waitCount int, slaMet int, slaTotal int, err error) {
	var t models.Ticket
	if err := db.Where("id = ?", ticketID).First(&t).Error; err != nil {
		return 0, 0, 0, 0, err
	}
	if t.CalledAt == nil {
		return 0, 0, 0, 0, nil
	}
	calledAt := *t.CalledAt
	var histories []models.TicketHistory
	if err := db.Where("ticket_id = ?", ticketID).Order("created_at ASC").Find(&histories).Error; err != nil {
		return 0, 0, 0, 0, err
	}
	segStart := queueWaitSegmentStart(t.CreatedAt, histories, calledAt)
	waitMs := calledAt.Sub(segStart).Milliseconds()
	if waitMs < 0 {
		waitMs = 0
	}
	waitSumMs = waitMs
	waitCount = 1
	if t.MaxWaitingTime != nil && *t.MaxWaitingTime > 0 {
		slaTotal = 1
		maxSec := float64(*t.MaxWaitingTime)
		waitSec := float64(waitMs) / 1000.0
		if waitSec <= maxSec {
			slaMet = 1
		}
	}
	return waitSumMs, waitCount, slaMet, slaTotal, nil
}

// waitSLANoCallClosureOneTicket is for tickets closed as no_show without ever being called (queue cleared at EOD).
// Waiting time ends at completed_at instead of called_at.
func waitSLANoCallClosureOneTicket(db *gorm.DB, ticketID string) (waitSumMs int64, waitCount int, slaMet int, slaTotal int, err error) {
	var t models.Ticket
	if err := db.Where("id = ?", ticketID).First(&t).Error; err != nil {
		return 0, 0, 0, 0, err
	}
	if t.CalledAt != nil {
		return 0, 0, 0, 0, nil
	}
	if t.CompletedAt == nil || t.Status != "no_show" {
		return 0, 0, 0, 0, nil
	}
	endAt := *t.CompletedAt
	var histories []models.TicketHistory
	if err := db.Where("ticket_id = ?", ticketID).Order("created_at ASC").Find(&histories).Error; err != nil {
		return 0, 0, 0, 0, err
	}
	segStart := queueWaitSegmentStart(t.CreatedAt, histories, endAt)
	waitMs := endAt.Sub(segStart).Milliseconds()
	if waitMs < 0 {
		waitMs = 0
	}
	waitSumMs = waitMs
	waitCount = 1
	if t.MaxWaitingTime != nil && *t.MaxWaitingTime > 0 {
		slaTotal = 1
		maxSec := float64(*t.MaxWaitingTime)
		waitSec := float64(waitMs) / 1000.0
		if waitSec <= maxSec {
			slaMet = 1
		}
	}
	return waitSumMs, waitCount, slaMet, slaTotal, nil
}

// queueWaitSegmentStart returns the start of the waiting segment that ends at calledAt:
// created_at, or the last ticket.transferred strictly before called_at (inclusive of that instant as new segment start).
func queueWaitSegmentStart(createdAt time.Time, histories []models.TicketHistory, calledAt time.Time) time.Time {
	segStart := createdAt
	for i := range histories {
		h := histories[i]
		if !h.CreatedAt.Before(calledAt) {
			break
		}
		if h.Action == ticketaudit.ActionTicketTransferred {
			segStart = h.CreatedAt
		}
	}
	return segStart
}
