package repository

import (
	"context"
	"strings"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/subscriptionfeatures"

	"gorm.io/gorm"
)

// InsertWebhookOutboxIfEligibleTx writes webhook_outbox in the same transaction as ticket_histories
// when the tenant plan includes outbound_webhooks.
func InsertWebhookOutboxIfEligibleTx(ctx context.Context, tx *gorm.DB, h *models.TicketHistory) error {
	if h == nil || strings.TrimSpace(h.TicketID) == "" {
		return nil
	}
	var companyID string
	if err := tx.WithContext(ctx).Raw(`
SELECT u.company_id FROM tickets t
JOIN units u ON u.id = t.unit_id
WHERE t.id = ? LIMIT 1
`, h.TicketID).Scan(&companyID).Error; err != nil {
		return err
	}
	if strings.TrimSpace(companyID) == "" {
		return nil
	}
	ok, err := subscriptionfeatures.CompanyHasOutboundWebhooks(ctx, tx, companyID)
	if err != nil || !ok {
		return err
	}
	row := models.WebhookOutbox{
		CompanyID:       companyID,
		TicketHistoryID: h.ID,
	}
	return tx.WithContext(ctx).Create(&row).Error
}
