package services

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
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
	sort.Slice(histories, func(i, j int) bool {
		return histories[i].CreatedAt.Before(histories[j].CreatedAt)
	})
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

// aggregateServiceTimeForServedTicketsCompletedInRange sums segment durations and counts segments with duration > 0
// for tickets served with completed_at in [startUTC, endUTC), optionally restricted to service_zone_id.
func aggregateServiceTimeForServedTicketsCompletedInRange(
	seg repository.StatisticsTicketSegmentsRepository,
	unitID string,
	zoneID string,
	startUTC, endUTC time.Time,
) (sumMs int64, segCount int, err error) {
	ids, err := seg.ListTicketIDsServedCompletedInRangeForService(unitID, startUTC, endUTC, zoneID)
	if err != nil {
		return 0, 0, err
	}
	ticketMap, err := seg.BatchTicketsByIDs(ids)
	if err != nil {
		return 0, 0, err
	}
	histMap, err := seg.BatchHistoriesByTicketIDs(ids)
	if err != nil {
		return 0, 0, err
	}
	for _, tid := range ids {
		t, ok := ticketMap[tid]
		if !ok {
			continue
		}
		segs := buildServiceTimeSegments(histMap[tid], t)
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

// aggregateServiceTimeForOperatorOnTouchedTicketsPreloaded sums in_service segments for operatorUserID using
// tickets and histories already loaded (one batch per rollup operator).
func aggregateServiceTimeForOperatorOnTouchedTicketsPreloaded(
	operatorUserID string,
	touchedTicketIDs []string,
	ticketMap map[string]models.Ticket,
	histMap map[string][]models.TicketHistory,
) (sumMs int64, segCount int) {
	op := strings.TrimSpace(operatorUserID)
	if op == "" {
		return 0, 0
	}
	for _, tid := range touchedTicketIDs {
		tid = strings.TrimSpace(tid)
		if tid == "" {
			continue
		}
		t, ok := ticketMap[tid]
		if !ok || t.Status != "served" || t.CompletedAt == nil {
			continue
		}
		segs := buildServiceTimeSegments(histMap[tid], t)
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
	return sumMs, segCount
}

// operatorServiceMinutesByHourForDay distributes this operator's in_service segment minutes into local
// hour buckets for bucketDate (same touched-ticket window and served-ticket filter as daily operator rollup).
func operatorServiceMinutesByHourForDay(
	seg repository.StatisticsTicketSegmentsRepository,
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

	ticketMap, err := seg.BatchTicketsByIDs(touchedIDs)
	if err != nil {
		return out, err
	}
	histMap, err := seg.BatchHistoriesByTicketIDs(touchedIDs)
	if err != nil {
		return out, err
	}
	for _, tid := range touchedIDs {
		t, ok := ticketMap[tid]
		if !ok || t.Status != "served" || t.CompletedAt == nil {
			continue
		}
		segs := buildServiceTimeSegments(histMap[tid], t)
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
				hsLoc := time.Date(ds.Year(), ds.Month(), ds.Day(), h, 0, 0, 0, loc)
				var heLoc time.Time
				if h == 23 {
					heLoc = ds.AddDate(0, 0, 1)
				} else {
					heLoc = time.Date(ds.Year(), ds.Month(), ds.Day(), h+1, 0, 0, 0, loc)
				}
				hs := hsLoc.UTC()
				he := heLoc.UTC()
				out[h] += overlapMinutesUTC(s0, s1, hs, he)
			}
		}
	}
	return out, nil
}

// computeServiceSLAForTicketsCompletedInRange counts served tickets in [startUTC, endUTC) whose
// confirmed_at→completed_at duration is within max_service_time (SLA met) vs total with max_service_time set.
// Uses ticketduration.ServiceSeconds (floor seconds from confirmed_at), consistent with the supervisor UI anchor.
func computeServiceSLAForTicketsCompletedInRange(
	seg repository.StatisticsTicketSegmentsRepository,
	unitID string,
	startUTC, endUTC time.Time,
	zoneID string,
) (slaMet int, slaTotal int, err error) {
	ids, err := seg.ListTicketIDsServedCompletedInRangeForService(unitID, startUTC, endUTC, zoneID)
	if err != nil {
		return 0, 0, err
	}
	if len(ids) == 0 {
		return 0, 0, nil
	}
	ticketMap, err := seg.BatchTicketsByIDs(ids)
	if err != nil {
		return 0, 0, err
	}
	for _, tid := range ids {
		t, ok := ticketMap[tid]
		if !ok {
			continue
		}
		if t.MaxServiceTime == nil || *t.MaxServiceTime <= 0 {
			continue
		}
		secs, ok := ticketdurationServiceSeconds(&t)
		if !ok {
			continue
		}
		slaTotal++
		if secs <= *t.MaxServiceTime {
			slaMet++
		}
	}
	return slaMet, slaTotal, nil
}

// ticketdurationServiceSeconds computes the service duration as (completed_at - confirmed_at) in seconds.
// Returns the truncated integer seconds and true; returns 0, false when timestamps are absent or invalid.
func ticketdurationServiceSeconds(t *models.Ticket) (int, bool) {
	if t.ConfirmedAt == nil || t.CompletedAt == nil {
		return 0, false
	}
	if t.CompletedAt.Before(*t.ConfirmedAt) {
		return 0, false
	}
	return int(t.CompletedAt.Sub(*t.ConfirmedAt).Seconds()), true
}
