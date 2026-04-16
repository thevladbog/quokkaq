// Package summary parses and formats QuokkaQ calendar event SUMMARY lines for Yandex CalDAV.
package summary

import (
	"fmt"
	"strings"
)

const (
	MarkerQQ           = "[QQ]"
	TokenBooked        = "[Забронирован]"
	TokenAwaiting      = "[Ожидает]"
	StateFree          = "free"
	StateBooked        = "booked"
	StateTicketWaiting = "ticket_waiting"
	StateUnknown       = "unknown"
)

// Parsed holds a parsed SUMMARY for a slot event.
type Parsed struct {
	State        string
	ServiceLabel string
	TicketToken  string // e.g. A-005 when StateTicketWaiting
}

// Parse extracts state and service label from a SUMMARY line.
func Parse(summary string) Parsed {
	s := strings.TrimSpace(summary)
	if !strings.Contains(s, MarkerQQ) {
		return Parsed{State: StateUnknown, ServiceLabel: s}
	}
	// Ticket waiting: [<token>][Ожидает][QQ] label
	if strings.Contains(s, TokenAwaiting) {
		tok := extractBracketTokenBeforeAwaiting(s)
		label := extractAfterMarkerQQ(s)
		return Parsed{State: StateTicketWaiting, ServiceLabel: label, TicketToken: tok}
	}
	if strings.Contains(s, TokenBooked) {
		label := extractAfterMarkerQQ(s)
		return Parsed{State: StateBooked, ServiceLabel: label}
	}
	label := extractAfterMarkerQQ(s)
	return Parsed{State: StateFree, ServiceLabel: strings.TrimSpace(label)}
}

func extractAfterMarkerQQ(s string) string {
	i := strings.Index(s, MarkerQQ)
	if i < 0 {
		return ""
	}
	return strings.TrimSpace(s[i+len(MarkerQQ):])
}

func extractBracketTokenBeforeAwaiting(s string) string {
	// Format: [A-005][Ожидает][QQ] ...
	idxAwait := strings.Index(s, TokenAwaiting)
	if idxAwait <= 0 {
		return ""
	}
	left := strings.TrimSpace(s[:idxAwait])
	if !strings.HasPrefix(left, "[") {
		return ""
	}
	rest := left[1:]
	close := strings.Index(rest, "]")
	if close < 0 {
		return ""
	}
	return strings.TrimSpace(rest[:close])
}

// FormatFree returns "[QQ] <label>".
func FormatFree(serviceLabel string) string {
	return fmt.Sprintf("%s %s", MarkerQQ, strings.TrimSpace(serviceLabel))
}

// FormatBooked returns "[Забронирован][QQ] <label>".
func FormatBooked(serviceLabel string) string {
	return fmt.Sprintf("%s%s %s", TokenBooked, MarkerQQ, strings.TrimSpace(serviceLabel))
}

// FormatTicketWaiting returns "[<token>][Ожидает][QQ] <label>".
func FormatTicketWaiting(ticketDisplayToken, serviceLabel string) string {
	t := strings.TrimSpace(ticketDisplayToken)
	l := strings.TrimSpace(serviceLabel)
	return fmt.Sprintf("[%s]%s%s %s", t, TokenAwaiting, MarkerQQ, l)
}

// ServiceLabelForService returns the label segment used in calendar titles.
func ServiceLabelForService(name string, calendarSlotKey *string) string {
	if calendarSlotKey != nil && strings.TrimSpace(*calendarSlotKey) != "" {
		return strings.TrimSpace(*calendarSlotKey)
	}
	return strings.TrimSpace(name)
}
