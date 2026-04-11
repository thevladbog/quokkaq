// Package ticketaudit defines stable action names and payloads for ticket_histories (DWH / analytics).
package ticketaudit

import (
	"encoding/json"

	"quokkaq-go-backend/internal/models"
)

const (
	ActionTicketCreated         = "ticket.created"
	ActionTicketCalled          = "ticket.called"
	ActionTicketRecalled        = "ticket.recalled"
	ActionTicketStatusChanged   = "ticket.status_changed"
	ActionTicketTransferred     = "ticket.transferred"
	ActionTicketReturnedToQueue = "ticket.returned_to_queue"
	ActionTicketEODFlagged      = "ticket.eod_flagged"
)

// NewHistory builds a TicketHistory row. Payload keys should be snake_case JSON for consumers.
func NewHistory(ticketID, action string, actorUserID *string, payload map[string]interface{}) (*models.TicketHistory, error) {
	var raw []byte
	var err error
	if len(payload) == 0 {
		raw = []byte("{}")
	} else {
		raw, err = json.Marshal(payload)
		if err != nil {
			return nil, err
		}
	}
	return &models.TicketHistory{
		TicketID: ticketID,
		Action:   action,
		UserID:   actorUserID,
		Payload:  raw,
	}, nil
}
