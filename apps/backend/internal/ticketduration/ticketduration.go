// Package ticketduration defines duration calculations aligned with supervisor UI (see apps/frontend supervisor-queue-utils).
//
// TODO: Wire these into ticket/shift HTTP DTOs when the API should return server-computed wait/service seconds
// (e.g. journal exports or kiosk) instead of duplicating logic in clients.
package ticketduration

import (
	"math"
	"time"

	"quokkaq-go-backend/internal/models"
)

// QueueWaitSeconds is seconds from ticket creation until call to counter (created_at → called_at), floored, non-negative.
func QueueWaitSeconds(t *models.Ticket) (int, bool) {
	if t == nil || t.CalledAt == nil {
		return 0, false
	}
	if t.CalledAt.Before(t.CreatedAt) {
		return 0, false
	}
	d := t.CalledAt.Sub(t.CreatedAt)
	return int(d / time.Second), true
}

// ServiceSeconds is seconds from in_service (confirmed_at) until service end (completed_at), floored, non-negative.
// Matches supervisor service timer anchor (confirmedAt), not calledAt.
func ServiceSeconds(t *models.Ticket) (int, bool) {
	if t == nil || t.ConfirmedAt == nil || t.CompletedAt == nil {
		return 0, false
	}
	if t.CompletedAt.Before(*t.ConfirmedAt) {
		return 0, false
	}
	d := t.CompletedAt.Sub(*t.ConfirmedAt)
	return int(d / time.Second), true
}

// IntervalSeconds returns floor(max(0, end-start)) in seconds for operator idle/break intervals (same discretization as TS floor).
func IntervalSeconds(startedAt, endedAt time.Time) int {
	sec := endedAt.Sub(startedAt).Seconds()
	if sec <= 0 {
		return 0
	}
	return int(math.Floor(sec))
}
