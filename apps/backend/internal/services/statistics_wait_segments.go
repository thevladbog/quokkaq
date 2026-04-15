package services

import (
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/internal/ticketaudit"
)

// computeWaitSLAForTicketsCalledInRange aggregates queue wait (ms) and SLA for:
//   - tickets whose qualifying call falls in [startUTC, endUTC); and
//   - tickets never called but closed as no_show with completed_at in [startUTC, endUTC) (e.g. EOD queue sweep).
//
// Wait duration uses the segment after the last ticket.transferred strictly before the end instant (call or closure).
func computeWaitSLAForTicketsCalledInRange(
	seg repository.StatisticsTicketSegmentsRepository,
	unitID string,
	startUTC, endUTC time.Time,
	zoneID string,
) (waitSumMs int64, waitCount int, slaMet int, slaTotal int, err error) {
	ticketIDs, err := seg.ListTicketIDsCalledInRangeForWait(unitID, startUTC, endUTC, zoneID)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	noCallIDs, err := seg.ListTicketIDsNoShowClosedInRangeForWait(unitID, startUTC, endUTC, zoneID)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	allIDs := unionTicketIDLists(ticketIDs, noCallIDs)
	ticketMap, err := seg.BatchTicketsByIDs(allIDs)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	histMap, err := seg.BatchHistoriesByTicketIDs(allIDs)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	for _, tid := range ticketIDs {
		t, ok := ticketMap[tid]
		if !ok {
			continue
		}
		ws, wc, sm, st := waitSLAMetricsCalledTicketData(t, histMap[tid])
		waitSumMs += ws
		waitCount += wc
		slaMet += sm
		slaTotal += st
	}
	for _, tid := range noCallIDs {
		t, ok := ticketMap[tid]
		if !ok {
			continue
		}
		ws, wc, sm, st := waitSLAMetricsNoCallClosureData(t, histMap[tid])
		waitSumMs += ws
		waitCount += wc
		slaMet += sm
		slaTotal += st
	}
	return waitSumMs, waitCount, slaMet, slaTotal, nil
}

func unionTicketIDLists(a, b []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(a)+len(b))
	for _, list := range [][]string{a, b} {
		for _, id := range list {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

// waitSLAMetricsCalledTicketData applies the same rules as waitSLAOneTicket using preloaded rows (no DB).
func waitSLAMetricsCalledTicketData(t models.Ticket, histories []models.TicketHistory) (waitSumMs int64, waitCount int, slaMet int, slaTotal int) {
	if t.CalledAt == nil {
		return 0, 0, 0, 0
	}
	calledAt := *t.CalledAt
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
	return waitSumMs, waitCount, slaMet, slaTotal
}

// waitSLAMetricsNoCallClosureData applies the same rules as waitSLANoCallClosureOneTicket using preloaded rows (no DB).
func waitSLAMetricsNoCallClosureData(t models.Ticket, histories []models.TicketHistory) (waitSumMs int64, waitCount int, slaMet int, slaTotal int) {
	if t.CalledAt != nil {
		return 0, 0, 0, 0
	}
	if t.CompletedAt == nil || t.Status != "no_show" {
		return 0, 0, 0, 0
	}
	endAt := *t.CompletedAt
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
	return waitSumMs, waitCount, slaMet, slaTotal
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
