package handlers

import (
	"encoding/json"

	"quokkaq-go-backend/internal/models"
)

// kioskVisitorSMSAfterTicketEnabled is false when unit config explicitly sets
// `config.kiosk.visitorSmsAfterTicket` to false. When true or unset, a mandatory
// post-ticket SMS step may be shown (subject to plan + platform SMS gating on the server).
func kioskVisitorSMSAfterTicketEnabled(unit *models.Unit) bool {
	if unit == nil || len(unit.Config) == 0 {
		return true
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(unit.Config, &root); err != nil {
		return true
	}
	kraw, ok := root["kiosk"]
	if !ok {
		return true
	}
	var k map[string]interface{}
	if err := json.Unmarshal(kraw, &k); err != nil {
		return true
	}
	if v, has := k["visitorSmsAfterTicket"]; has {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return true
}
