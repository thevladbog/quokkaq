// Package ticketduration defines duration calculations aligned with supervisor UI (see apps/frontend supervisor-queue-utils).
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
	start := t.CreatedAt.Unix()
	called := t.CalledAt.Unix()
	if called < start {
		return 0, false
	}
	return int(called - start), true
}

// ServiceSeconds is seconds from in_service (confirmed_at) until service end (completed_at), floored, non-negative.
// Matches supervisor service timer anchor (confirmedAt), not calledAt.
func ServiceSeconds(t *models.Ticket) (int, bool) {
	if t == nil || t.ConfirmedAt == nil || t.CompletedAt == nil {
		return 0, false
	}
	a := t.ConfirmedAt.Unix()
	b := t.CompletedAt.Unix()
	if b < a {
		return 0, false
	}
	return int(b - a), true
}

// IntervalSeconds returns floor(max(0, end-start)) in seconds for operator idle/break intervals (same discretization as TS floor).
func IntervalSeconds(startedAt, endedAt time.Time) int {
	sec := endedAt.Sub(startedAt).Seconds()
	if sec <= 0 {
		return 0
	}
	return int(math.Floor(sec))
}
