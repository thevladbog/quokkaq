package services

import (
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestBuildCounterBoardSessionPayload_staffedAndBreak(t *testing.T) {
	t.Parallel()
	uid := "user-1"
	c := &models.Counter{
		ID:         "cnt-1",
		Name:       "Window",
		AssignedTo: &uid,
		OnBreak:    true,
	}
	u := &models.Unit{ID: "u1"}
	out := buildCounterBoardSessionPayload(c, u, nil)
	if !out.CounterStaffed {
		t.Fatal("CounterStaffed: got false want true")
	}
	if !out.OnBreak {
		t.Fatal("OnBreak: got false want true")
	}
	if out.CounterID != "cnt-1" || out.CounterName != "Window" {
		t.Fatalf("ids: %+v", out)
	}
	if out.ActiveTicket != nil {
		t.Fatal("expected no ticket")
	}
	if out.UnitConfig != nil {
		t.Fatal("expected no unit config")
	}
}

func TestBuildCounterBoardSessionPayload_unstaffed(t *testing.T) {
	t.Parallel()
	c := &models.Counter{
		ID:   "cnt-2",
		Name: "Solo",
	}
	u := &models.Unit{ID: "u1"}
	out := buildCounterBoardSessionPayload(c, u, nil)
	if out.CounterStaffed {
		t.Fatal("CounterStaffed: got true want false")
	}
}

func TestBuildCounterBoardSessionPayload_unitConfigAndTicket(t *testing.T) {
	t.Parallel()
	raw := json.RawMessage(`{"adScreen":{"adWidthPct":20}}`)
	u := &models.Unit{ID: "u1", Config: raw}
	tk := &models.Ticket{
		ID:          "t1",
		QueueNumber: "A12",
		Status:      "called",
	}
	c := &models.Counter{ID: "c1", Name: "N"}
	out := buildCounterBoardSessionPayload(c, u, tk)
	if string(out.UnitConfig) != string(raw) {
		t.Fatalf("unitConfig %s", string(out.UnitConfig))
	}
	if out.ActiveTicket == nil || out.ActiveTicket.ID != "t1" || out.ActiveTicket.QueueNumber != "A12" || out.ActiveTicket.Status != "called" {
		t.Fatalf("activeTicket %+v", out.ActiveTicket)
	}
}
