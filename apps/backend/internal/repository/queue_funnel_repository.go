package repository

import (
	"encoding/json"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

// QueueFunnelRepository records queue/kiosk marketing funnel events.
type QueueFunnelRepository interface {
	Insert(e *models.QueueFunnelEvent) error
	// ExistsByTicketIDAndEvent returns true if a row with the given ticket and event already exists.
	ExistsByTicketIDAndEvent(ticketID, event string) (bool, error)
	NotificationStatusCounts(companyID string) (pending, sent, failed int64, err error)
}

type queueFunnelRepository struct{}

func NewQueueFunnelRepository() QueueFunnelRepository { return &queueFunnelRepository{} }

func (r *queueFunnelRepository) Insert(e *models.QueueFunnelEvent) error {
	return database.DB.Create(e).Error
}

func (r *queueFunnelRepository) ExistsByTicketIDAndEvent(ticketID, event string) (bool, error) {
	if strings.TrimSpace(ticketID) == "" || strings.TrimSpace(event) == "" {
		return false, nil
	}
	var n int64
	err := database.DB.Model(&models.QueueFunnelEvent{}).
		Where("ticket_id = ? AND event = ?", ticketID, event).
		Limit(1).
		Count(&n).Error
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// NotificationStatusCounts returns SMS notification row counts for the tenant in the last 7 days.
func (r *queueFunnelRepository) NotificationStatusCounts(companyID string) (pending, sent, failed int64, err error) {
	type row struct {
		Status string
		C      int64
	}
	var rows []row
	// join notifications to tickets to scope by company
	qerr := database.DB.Raw(`
SELECT n.status, count(*)::bigint AS c
FROM notifications n
INNER JOIN tickets t ON t.id = (n.payload->>'ticket_id')::uuid
INNER JOIN units u ON u.id = t.unit_id
WHERE u.company_id = ?
  AND n.type IN ('ticket_welcome_sms', 'ticket_called', 'queue_position_alert')
  AND n.created_at >= NOW() - interval '7 days'
GROUP BY n.status
`, companyID).Scan(&rows).Error
	if qerr != nil {
		return 0, 0, 0, qerr
	}
	for _, x := range rows {
		switch x.Status {
		case "pending":
			pending = x.C
		case "sent":
			sent = x.C
		case "failed":
			failed = x.C
		}
	}
	return pending, sent, failed, nil
}

// Ensure meta is valid JSON
func FunnelMeta(v map[string]any) []byte {
	if v == nil {
		return nil
	}
	b, _ := json.Marshal(v)
	return b
}
