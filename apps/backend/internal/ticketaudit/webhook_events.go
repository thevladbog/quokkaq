package ticketaudit

import "strings"

// AllowedWebhookEventTypes lists ticket_histories actions that may be subscribed on outbound webhooks.
func AllowedWebhookEventTypes() []string {
	return []string{
		ActionTicketCreated,
		ActionTicketCalled,
		ActionTicketRecalled,
		ActionTicketStatusChanged,
		ActionTicketTransferred,
		ActionTicketReturnedToQueue,
		ActionTicketEODFlagged,
		ActionTicketOperatorCommentUpdated,
		ActionTicketVisitorUpdated,
		ActionTicketVisitorTagsUpdated,
		ActionTicketVisitorCancelled,
		ActionTicketPhoneAttached,
	}
}

// WebhookEventTypeAllowed reports whether t is a known webhook event type (case-insensitive).
func WebhookEventTypeAllowed(t string) bool {
	t = strings.TrimSpace(strings.ToLower(t))
	if t == "" {
		return false
	}
	for _, a := range AllowedWebhookEventTypes() {
		if strings.EqualFold(strings.TrimSpace(a), t) {
			return true
		}
	}
	return false
}
