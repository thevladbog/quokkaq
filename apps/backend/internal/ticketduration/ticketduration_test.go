package ticketduration

import (
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
)

func TestQueueWaitSeconds(t *testing.T) {
	t.Parallel()
	created := time.Date(2026, 4, 12, 10, 0, 0, 0, time.UTC)
	called := time.Date(2026, 4, 12, 10, 1, 30, 500_000_000, time.UTC)

	t.Run("nil ticket", func(t *testing.T) {
		t.Parallel()
		sec, ok := QueueWaitSeconds(nil)
		if ok || sec != 0 {
			t.Fatalf("got (%d, %v), want (0, false)", sec, ok)
		}
	})
	t.Run("missing calledAt", func(t *testing.T) {
		t.Parallel()
		sec, ok := QueueWaitSeconds(&models.Ticket{CreatedAt: created})
		if ok || sec != 0 {
			t.Fatalf("got (%d, %v), want (0, false)", sec, ok)
		}
	})
	t.Run("negative span", func(t *testing.T) {
		t.Parallel()
		early := created.Add(-time.Minute)
		sec, ok := QueueWaitSeconds(&models.Ticket{CreatedAt: created, CalledAt: &early})
		if ok || sec != 0 {
			t.Fatalf("got (%d, %v), want (0, false)", sec, ok)
		}
	})
	t.Run("floors to whole seconds", func(t *testing.T) {
		t.Parallel()
		sec, ok := QueueWaitSeconds(&models.Ticket{CreatedAt: created, CalledAt: &called})
		if !ok || sec != 90 {
			t.Fatalf("got (%d, %v), want (90, true)", sec, ok)
		}
	})
}

func TestServiceSeconds(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, 4, 12, 11, 0, 0, 0, time.UTC)
	end := time.Date(2026, 4, 12, 11, 0, 2, 800_000_000, time.UTC)

	t.Run("missing timestamps", func(t *testing.T) {
		t.Parallel()
		sec, ok := ServiceSeconds(&models.Ticket{})
		if ok || sec != 0 {
			t.Fatalf("got (%d, %v), want (0, false)", sec, ok)
		}
	})
	t.Run("negative span", func(t *testing.T) {
		t.Parallel()
		sec, ok := ServiceSeconds(&models.Ticket{
			ConfirmedAt: &end,
			CompletedAt: &start,
		})
		if ok || sec != 0 {
			t.Fatalf("got (%d, %v), want (0, false)", sec, ok)
		}
	})
	t.Run("floors to whole seconds", func(t *testing.T) {
		t.Parallel()
		sec, ok := ServiceSeconds(&models.Ticket{
			ConfirmedAt: &start,
			CompletedAt: &end,
		})
		if !ok || sec != 2 {
			t.Fatalf("got (%d, %v), want (2, true)", sec, ok)
		}
	})
}

func TestIntervalSeconds(t *testing.T) {
	t.Parallel()
	a := time.Date(2026, 4, 12, 12, 0, 0, 0, time.UTC)
	b := time.Date(2026, 4, 12, 12, 0, 1, 750_000_000, time.UTC)

	if got := IntervalSeconds(a, a); got != 0 {
		t.Fatalf("zero length: got %d", got)
	}
	if got := IntervalSeconds(b, a); got != 0 {
		t.Fatalf("inverted: got %d", got)
	}
	if got := IntervalSeconds(a, b); got != 1 {
		t.Fatalf("floor: got %d, want 1", got)
	}
}
