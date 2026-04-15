package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ticketaudit"

	"gorm.io/gorm"
)

// ServiceTimeSegment is one continuous in_service episode, closed by transfer (to waiting) or terminal status.
type ServiceTimeSegment struct {
	ServiceID      string
	OperatorUserID *string
	Start          time.Time
	End            time.Time
	DurationMs     int64
}

// buildServiceTimeSegments reconstructs serving intervals from ticket_histories.
// Rules (see RollupUnitDay comment): segment opens on ticket.status_changed to in_service; closes on
// ticket.transferred, ticket.status_changed to served/no_show/cancelled/completed, or ticket.CompletedAt if still open for a served ticket.
func buildServiceTimeSegments(histories []models.TicketHistory, ticket models.Ticket) []ServiceTimeSegment {
	if len(histories) == 0 {
		return nil
	}
	type openSeg struct {
		start          time.Time
		serviceID      string
		operatorUserID *string
	}
	var curSvc string
	var open *openSeg
	var out []ServiceTimeSegment

	closeOpen := func(end time.Time) {
		if open == nil {
			return
		}
		if !end.After(open.start) {
			open = nil
			return
		}
		ms := end.Sub(open.start).Milliseconds()
		if ms > 0 && strings.TrimSpace(open.serviceID) != "" {
			out = append(out, ServiceTimeSegment{
				ServiceID:      open.serviceID,
				OperatorUserID: open.operatorUserID,
				Start:          open.start,
				End:            end,
				DurationMs:     ms,
			})
		}
		open = nil
	}

	for i := range histories {
		h := histories[i]
		m := parseHistoryPayloadMap(h.Payload)

		switch h.Action {
		case ticketaudit.ActionTicketCreated:
			if s := payloadString(m, "service_id"); s != "" {
				curSvc = s
			}
		case ticketaudit.ActionTicketCalled:
			if s := payloadString(m, "service_id"); s != "" {
				curSvc = s
			}
		case ticketaudit.ActionTicketTransferred:
			closeOpen(h.CreatedAt)
			if s := payloadString(m, "to_service_id"); s != "" {
				curSvc = s
			}
		case ticketaudit.ActionTicketReturnedToQueue:
			closeOpen(h.CreatedAt)
		case ticketaudit.ActionTicketRecalled:
			closeOpen(h.CreatedAt)
		case ticketaudit.ActionTicketStatusChanged:
			to := payloadString(m, "to_status")
			switch to {
			case "in_service":
				if open != nil {
					closeOpen(h.CreatedAt)
				}
				svc := strings.TrimSpace(curSvc)
				if svc == "" {
					svc = strings.TrimSpace(ticket.ServiceID)
				}
				if svc == "" {
					continue
				}
				op := h.UserID
				open = &openSeg{start: h.CreatedAt, serviceID: svc, operatorUserID: op}
			case "served", "no_show", "cancelled", "completed":
				closeOpen(h.CreatedAt)
			}
		}
	}

	if ticket.Status == "served" && ticket.CompletedAt != nil && open != nil {
		closeOpen(*ticket.CompletedAt)
	} else if open != nil {
		open = nil
	}

	return out
}

func parseHistoryPayloadMap(raw []byte) map[string]interface{} {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var m map[string]interface{}
	if json.Unmarshal(raw, &m) != nil {
		return nil
	}
	return m
}

func payloadString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case json.Number:
		return strings.TrimSpace(x.String())
	case float64:
		return strings.TrimSpace(fmt.Sprintf("%.0f", x))
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func loadTicketHistoriesOrdered(db *gorm.DB, ticketID string) ([]models.TicketHistory, error) {
	var histories []models.TicketHistory
	if err := db.Where("ticket_id = ?", ticketID).Order("created_at ASC").Find(&histories).Error; err != nil {
		return nil, err
	}
	return histories, nil
}

// aggregateServiceTimeForServedTicketsCompletedInRange sums segment durations and counts segments with duration > 0
// for tickets served with completed_at in [startUTC, endUTC), optionally restricted to service_zone_id.
func aggregateServiceTimeForServedTicketsCompletedInRange(
	db *gorm.DB,
	unitID string,
	zoneID string,
	startUTC, endUTC time.Time,
) (sumMs int64, segCount int, err error) {
	var z1, z2 interface{}
	if strings.TrimSpace(zoneID) == "" {
		z1, z2 = nil, nil
	} else {
		z := strings.TrimSpace(zoneID)
		z1, z2 = z, z
	}
	var ids []string
	q := `
SELECT id::text FROM tickets
WHERE unit_id = ?
  AND status = 'served'
  AND completed_at IS NOT NULL
  AND completed_at >= ? AND completed_at < ?
  AND (NULLIF(TRIM(COALESCE(?::text, '')), '') IS NULL OR service_zone_id::text = NULLIF(TRIM(COALESCE(?::text, '')), ''))
`
	if err := db.Raw(q, unitID, startUTC, endUTC, z1, z2).Scan(&ids).Error; err != nil {
		return 0, 0, err
	}
	for _, tid := range ids {
		var t models.Ticket
		if err := db.Where("id = ?", tid).First(&t).Error; err != nil {
			return 0, 0, err
		}
		hist, err := loadTicketHistoriesOrdered(db, tid)
		if err != nil {
			return 0, 0, err
		}
		segs := buildServiceTimeSegments(hist, t)
		for _, s := range segs {
			if s.DurationMs <= 0 {
				continue
			}
			sumMs += s.DurationMs
			segCount++
		}
	}
	return sumMs, segCount, nil
}

// aggregateServiceTimeForOperatorOnTouchedTickets sums segments whose opening in_service was acted by operatorUserID,
// for tickets in touchedTicketIDs (typically “touched” by that operator via any status_changed that day).
func aggregateServiceTimeForOperatorOnTouchedTickets(
	db *gorm.DB,
	operatorUserID string,
	touchedTicketIDs []string,
) (sumMs int64, segCount int, err error) {
	op := strings.TrimSpace(operatorUserID)
	if op == "" {
		return 0, 0, nil
	}
	for _, tid := range touchedTicketIDs {
		tid = strings.TrimSpace(tid)
		if tid == "" {
			continue
		}
		var t models.Ticket
		if err := db.Where("id = ?", tid).First(&t).Error; err != nil {
			return 0, 0, err
		}
		if t.Status != "served" || t.CompletedAt == nil {
			continue
		}
		hist, err := loadTicketHistoriesOrdered(db, tid)
		if err != nil {
			return 0, 0, err
		}
		segs := buildServiceTimeSegments(hist, t)
		for _, s := range segs {
			if s.DurationMs <= 0 || s.OperatorUserID == nil {
				continue
			}
			if strings.TrimSpace(*s.OperatorUserID) != op {
				continue
			}
			sumMs += s.DurationMs
			segCount++
		}
	}
	return sumMs, segCount, nil
}

// operatorServiceMinutesByHourForDay distributes this operator's in_service segment minutes into local
// hour buckets for bucketDate (same touched-ticket window and served-ticket filter as daily operator rollup).
func operatorServiceMinutesByHourForDay(
	db *gorm.DB,
	subdivisionID, operatorUserID, bucketDate string,
	loc *time.Location,
	dayStartUTC, dayEndUTC time.Time,
) ([24]float64, error) {
	var out [24]float64
	var touchedIDs []string
	if err := db.Raw(`
SELECT DISTINCT h.ticket_id::text
FROM ticket_histories h
INNER JOIN tickets t ON t.id = h.ticket_id
WHERE t.unit_id::text = ? AND h.user_id::text = ?
  AND h.created_at >= ? AND h.created_at < ?`,
		subdivisionID, operatorUserID, dayStartUTC, dayEndUTC).Scan(&touchedIDs).Error; err != nil {
		return out, err
	}
	op := strings.TrimSpace(operatorUserID)
	dayStart, err := time.ParseInLocation("2006-01-02", bucketDate, loc)
	if err != nil {
		return out, err
	}
	ds := time.Date(dayStart.Year(), dayStart.Month(), dayStart.Day(), 0, 0, 0, 0, loc)

	for _, tid := range touchedIDs {
		var t models.Ticket
		if err := db.Where("id = ?", tid).First(&t).Error; err != nil {
			return out, err
		}
		if t.Status != "served" || t.CompletedAt == nil {
			continue
		}
		hist, err := loadTicketHistoriesOrdered(db, tid)
		if err != nil {
			return out, err
		}
		segs := buildServiceTimeSegments(hist, t)
		for _, s := range segs {
			if s.DurationMs <= 0 || s.OperatorUserID == nil {
				continue
			}
			if strings.TrimSpace(*s.OperatorUserID) != op {
				continue
			}
			s0 := s.Start.UTC()
			s1 := s.End.UTC()
			for h := 0; h < 24; h++ {
				hs := ds.Add(time.Duration(h) * time.Hour).UTC()
				he := hs.Add(time.Hour)
				out[h] += overlapMinutesUTC(s0, s1, hs, he)
			}
		}
	}
	return out, nil
}
