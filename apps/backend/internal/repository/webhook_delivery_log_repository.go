package repository

import (
	"context"
	"strings"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

// ListWebhookDeliveryLogsForCompany returns recent delivery attempts for endpoints owned by the company.
func ListWebhookDeliveryLogsForCompany(ctx context.Context, db *gorm.DB, companyID, endpointID string, limit int) ([]models.WebhookDeliveryLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	endpointID = strings.TrimSpace(endpointID)
	var rows []models.WebhookDeliveryLog
	q := db.WithContext(ctx).Model(&models.WebhookDeliveryLog{}).
		Joins("INNER JOIN webhook_endpoints e ON e.id = webhook_delivery_logs.webhook_endpoint_id").
		Where("e.company_id = ?", companyID).
		Order("webhook_delivery_logs.created_at DESC").
		Limit(limit)
	if endpointID != "" {
		q = q.Where("webhook_delivery_logs.webhook_endpoint_id = ?", endpointID)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
