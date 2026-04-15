package services

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ticketaudit"
)

func TestQueueWaitSegmentStart_noTransfer(t *testing.T) {
	t0 := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	called := time.Date(2026, 4, 1, 10, 15, 0, 0, time.UTC)
	got := queueWaitSegmentStart(t0, nil, called)
	if !got.Equal(t0) {
		t.Fatalf("expected %v, got %v", t0, got)
	}
}

func TestQueueWaitSegmentStart_resetsAtTransfer(t *testing.T) {
	created := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	transfer := time.Date(2026, 4, 1, 10, 5, 0, 0, time.UTC)
	called := time.Date(2026, 4, 1, 10, 20, 0, 0, time.UTC)
	hist := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketTransferred, CreatedAt: transfer},
	}
	got := queueWaitSegmentStart(created, hist, called)
	if !got.Equal(transfer) {
		t.Fatalf("expected transfer time %v, got %v", transfer, got)
	}
}

func TestQueueWaitSegmentStart_ignoresTransferAfterCall(t *testing.T) {
	created := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	called := time.Date(2026, 4, 1, 10, 10, 0, 0, time.UTC)
	later := time.Date(2026, 4, 1, 10, 20, 0, 0, time.UTC)
	hist := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketTransferred, CreatedAt: later},
	}
	got := queueWaitSegmentStart(created, hist, called)
	if !got.Equal(created) {
		t.Fatalf("transfer after call must not apply; expected %v, got %v", created, got)
	}
}
