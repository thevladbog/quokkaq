package ticketaudit

import (
	"encoding/json"
	"testing"
)

func TestNewHistory_payloadSnakeCase(t *testing.T) {
	uid := "actor-1"
	h, err := NewHistory("ticket-1", ActionTicketCalled, &uid, map[string]interface{}{
		"unit_id":     "u1",
		"from_status": "waiting",
		"to_status":   "called",
		"source":      "unit_call_next",
	})
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(h.Payload, &m); err != nil {
		t.Fatal(err)
	}
	if m["unit_id"] != "u1" {
		t.Fatalf("expected unit_id in payload, got %v", m)
	}
}
