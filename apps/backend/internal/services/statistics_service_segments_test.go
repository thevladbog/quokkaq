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
