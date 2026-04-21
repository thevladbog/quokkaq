package services

import (
	"encoding/json"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/ticketaudit"
)

func mustPayload(t *testing.T, m map[string]interface{}) []byte {
	t.Helper()
	b, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestBuildServiceTimeSegments_simpleServed(t *testing.T) {
	t0 := time.Date(2026, 4, 10, 9, 0, 0, 0, time.UTC)
	op := "11111111-1111-1111-1111-111111111111"
	h := []models.TicketHistory{
		{
			Action:    ticketaudit.ActionTicketCreated,
			CreatedAt: t0,
			Payload:   mustPayload(t, map[string]interface{}{"service_id": "svc-a"}),
		},
		{
			Action:    ticketaudit.ActionTicketCalled,
			CreatedAt: t0.Add(time.Minute),
			Payload:   mustPayload(t, map[string]interface{}{"service_id": "svc-a"}),
		},
		{
			Action:    ticketaudit.ActionTicketStatusChanged,
			CreatedAt: t0.Add(2 * time.Minute),
			UserID:    &op,
			Payload:   mustPayload(t, map[string]interface{}{"to_status": "in_service"}),
		},
		{
			Action:    ticketaudit.ActionTicketStatusChanged,
			CreatedAt: t0.Add(17 * time.Minute),
			Payload:   mustPayload(t, map[string]interface{}{"to_status": "served"}),
		},
	}
	done := t0.Add(17 * time.Minute)
	ticket := models.Ticket{
		Status:      "served",
		ServiceID:   "svc-a",
		CompletedAt: &done,
	}
	segs := buildServiceTimeSegments(h, ticket)
	if len(segs) != 1 {
		t.Fatalf("expected 1 segment, got %d", len(segs))
	}
	if segs[0].ServiceID != "svc-a" {
		t.Fatalf("service id %q", segs[0].ServiceID)
	}
	if segs[0].DurationMs != 15*60*1000 {
		t.Fatalf("duration ms %d", segs[0].DurationMs)
	}
	if segs[0].OperatorUserID == nil || *segs[0].OperatorUserID != op {
		t.Fatalf("operator %+v", segs[0].OperatorUserID)
	}
}

func TestBuildServiceTimeSegments_transferTwoEpisodesSameService(t *testing.T) {
	t0 := time.Date(2026, 4, 10, 10, 0, 0, 0, time.UTC)
	op := "22222222-2222-2222-2222-222222222222"
	h := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketCreated, CreatedAt: t0, Payload: mustPayload(t, map[string]interface{}{"service_id": "svc-x"})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
		{Action: ticketaudit.ActionTicketTransferred, CreatedAt: t0.Add(6 * time.Minute), Payload: mustPayload(t, map[string]interface{}{
			"to_service_id": "svc-x",
			"transfer_kind": "counter",
		})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(10 * time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(20 * time.Minute), Payload: mustPayload(t, map[string]interface{}{"to_status": "served"})},
	}
	done := t0.Add(20 * time.Minute)
	ticket := models.Ticket{Status: "served", ServiceID: "svc-x", CompletedAt: &done}
	segs := buildServiceTimeSegments(h, ticket)
	if len(segs) != 2 {
		t.Fatalf("expected 2 segments, got %d %+v", len(segs), segs)
	}
	if segs[0].DurationMs != 5*60*1000 || segs[1].DurationMs != 10*60*1000 {
		t.Fatalf("durations %d %d", segs[0].DurationMs, segs[1].DurationMs)
	}
}

// ── New edge-case tests added for SLA PR ────────────────────────────────────

func TestBuildServiceTimeSegments_emptyHistory(t *testing.T) {
	segs := buildServiceTimeSegments(nil, models.Ticket{Status: "served"})
	if len(segs) != 0 {
		t.Fatalf("expected 0 segments for empty history, got %d", len(segs))
	}
}

func TestBuildServiceTimeSegments_noInServiceEvent(t *testing.T) {
	t0 := time.Date(2026, 4, 11, 9, 0, 0, 0, time.UTC)
	done := t0.Add(5 * time.Minute)
	h := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketCreated, CreatedAt: t0, Payload: mustPayload(t, map[string]interface{}{"service_id": "svc-a"})},
		{Action: ticketaudit.ActionTicketCalled, CreatedAt: t0.Add(time.Minute), Payload: mustPayload(t, map[string]interface{}{"service_id": "svc-a"})},
	}
	ticket := models.Ticket{Status: "served", ServiceID: "svc-a", CompletedAt: &done}
	segs := buildServiceTimeSegments(h, ticket)
	if len(segs) != 0 {
		t.Fatalf("expected 0 segments when ticket was never confirmed as in_service, got %d", len(segs))
	}
}

func TestBuildServiceTimeSegments_returnToQueueCreatesTwoSegments(t *testing.T) {
	t0 := time.Date(2026, 4, 11, 10, 0, 0, 0, time.UTC)
	op := "aaaa0000-0000-0000-0000-000000000001"
	h := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketCreated, CreatedAt: t0, Payload: mustPayload(t, map[string]interface{}{"service_id": "svc-z"})},
		// First in_service episode: t0+1m to t0+6m (5 min)
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
		{Action: ticketaudit.ActionTicketReturnedToQueue, CreatedAt: t0.Add(6 * time.Minute), Payload: mustPayload(t, nil)},
		// Second in_service episode: t0+10m to t0+22m (12 min)
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(10 * time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(22 * time.Minute), Payload: mustPayload(t, map[string]interface{}{"to_status": "served"})},
	}
	done := t0.Add(22 * time.Minute)
	ticket := models.Ticket{Status: "served", ServiceID: "svc-z", CompletedAt: &done}
	segs := buildServiceTimeSegments(h, ticket)
	if len(segs) != 2 {
		t.Fatalf("expected 2 segments for return-to-queue+re-service, got %d", len(segs))
	}
	const want1Ms = 5 * 60 * 1000
	const want2Ms = 12 * 60 * 1000
	if segs[0].DurationMs != want1Ms {
		t.Fatalf("segment 1 duration: got %d ms, want %d", segs[0].DurationMs, want1Ms)
	}
	if segs[1].DurationMs != want2Ms {
		t.Fatalf("segment 2 duration: got %d ms, want %d", segs[1].DurationMs, want2Ms)
	}
	if segs[0].ServiceID != "svc-z" || segs[1].ServiceID != "svc-z" {
		t.Fatalf("unexpected service IDs: %q %q", segs[0].ServiceID, segs[1].ServiceID)
	}
}

func TestBuildServiceTimeSegments_stillInService_discarded(t *testing.T) {
	// A ticket that is still in_service (not yet served) should produce no segments
	// because the open segment has nowhere to close.
	t0 := time.Date(2026, 4, 11, 11, 0, 0, 0, time.UTC)
	op := "bbbb0000-0000-0000-0000-000000000002"
	h := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketCreated, CreatedAt: t0, Payload: mustPayload(t, map[string]interface{}{"service_id": "svc-w"})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
	}
	ticket := models.Ticket{Status: "in_service", ServiceID: "svc-w", CompletedAt: nil}
	segs := buildServiceTimeSegments(h, ticket)
	if len(segs) != 0 {
		t.Fatalf("expected 0 segments for still-in-service ticket, got %d", len(segs))
	}
}

func TestTicketdurationServiceSeconds(t *testing.T) {
	t.Parallel()
	base := time.Date(2026, 4, 11, 9, 0, 0, 0, time.UTC)

	t.Run("both timestamps present", func(t *testing.T) {
		confirmed := base
		completed := base.Add(5 * time.Minute)
		tick := models.Ticket{ConfirmedAt: &confirmed, CompletedAt: &completed}
		secs, ok := ticketdurationServiceSeconds(&tick)
		if !ok {
			t.Fatal("expected ok=true")
		}
		if secs != 300 {
			t.Fatalf("expected 300s, got %d", secs)
		}
	})

	t.Run("no confirmed_at", func(t *testing.T) {
		completed := base.Add(5 * time.Minute)
		tick := models.Ticket{ConfirmedAt: nil, CompletedAt: &completed}
		_, ok := ticketdurationServiceSeconds(&tick)
		if ok {
			t.Fatal("expected ok=false when ConfirmedAt is nil")
		}
	})

	t.Run("no completed_at", func(t *testing.T) {
		confirmed := base
		tick := models.Ticket{ConfirmedAt: &confirmed, CompletedAt: nil}
		_, ok := ticketdurationServiceSeconds(&tick)
		if ok {
			t.Fatal("expected ok=false when CompletedAt is nil")
		}
	})

	t.Run("completed before confirmed", func(t *testing.T) {
		confirmed := base.Add(5 * time.Minute)
		completed := base // earlier!
		tick := models.Ticket{ConfirmedAt: &confirmed, CompletedAt: &completed}
		_, ok := ticketdurationServiceSeconds(&tick)
		if ok {
			t.Fatal("expected ok=false when CompletedAt < ConfirmedAt")
		}
	})

	t.Run("same timestamp", func(t *testing.T) {
		confirmed := base
		completed := base
		tick := models.Ticket{ConfirmedAt: &confirmed, CompletedAt: &completed}
		secs, ok := ticketdurationServiceSeconds(&tick)
		if !ok {
			t.Fatal("expected ok=true for same timestamps")
		}
		if secs != 0 {
			t.Fatalf("expected 0s, got %d", secs)
		}
	})
}

func TestBuildServiceTimeSegments_transferChangesService(t *testing.T) {
	t0 := time.Date(2026, 4, 10, 11, 0, 0, 0, time.UTC)
	op := "33333333-3333-3333-3333-333333333333"
	h := []models.TicketHistory{
		{Action: ticketaudit.ActionTicketCreated, CreatedAt: t0, Payload: mustPayload(t, map[string]interface{}{"service_id": "svc-a"})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
		{Action: ticketaudit.ActionTicketTransferred, CreatedAt: t0.Add(5 * time.Minute), Payload: mustPayload(t, map[string]interface{}{
			"from_service_id": "svc-a",
			"to_service_id":   "svc-b",
			"transfer_kind":   "counter",
		})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(8 * time.Minute), UserID: &op, Payload: mustPayload(t, map[string]interface{}{"to_status": "in_service"})},
		{Action: ticketaudit.ActionTicketStatusChanged, CreatedAt: t0.Add(18 * time.Minute), Payload: mustPayload(t, map[string]interface{}{"to_status": "served"})},
	}
	done := t0.Add(18 * time.Minute)
	ticket := models.Ticket{Status: "served", ServiceID: "svc-b", CompletedAt: &done}
	segs := buildServiceTimeSegments(h, ticket)
	if len(segs) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(segs))
	}
	if segs[0].ServiceID != "svc-a" || segs[1].ServiceID != "svc-b" {
		t.Fatalf("services %q %q", segs[0].ServiceID, segs[1].ServiceID)
	}
}
