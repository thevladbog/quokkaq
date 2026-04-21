// Package ticketaudit defines stable action names and payloads for ticket_histories (DWH / analytics).
package ticketaudit

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"quokkaq-go-backend/internal/models"
)

const (
	ActionTicketCreated                = "ticket.created"
	ActionTicketCalled                 = "ticket.called"
	ActionTicketRecalled               = "ticket.recalled"
	ActionTicketStatusChanged          = "ticket.status_changed"
	ActionTicketTransferred            = "ticket.transferred"
	ActionTicketReturnedToQueue        = "ticket.returned_to_queue"
	ActionTicketEODFlagged             = "ticket.eod_flagged"
	ActionTicketOperatorCommentUpdated = "ticket.operator_comment_updated"
	ActionTicketVisitorUpdated         = "ticket.visitor_updated"
	ActionTicketVisitorTagsUpdated     = "ticket.visitor_tags_updated"
	ActionTicketVisitorCancelled       = "ticket.visitor_cancelled"
)

// NewHistory builds a TicketHistory row. Payload keys should be snake_case JSON for consumers.
func NewHistory(ticketID, action string, actorUserID *string, payload map[string]interface{}) (*models.TicketHistory, error) {
	if strings.TrimSpace(ticketID) == "" {
		return nil, errors.New("ticketaudit: ticketID is required")
	}
	if strings.TrimSpace(action) == "" {
		return nil, errors.New("ticketaudit: action is required")
	}

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
		ID:        uuid.New().String(),
		TicketID:  ticketID,
		Action:    action,
		UserID:    actorUserID,
		Payload:   raw,
		CreatedAt: time.Now().UTC(),
	}, nil
}
