package repository

import (
	"context"
	"time"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

const WebhookOutboxLease = 45 * time.Second

// ClaimNextWebhookOutbox selects the next due outbox row, sets locked_until for exclusive processing,
// and returns it. Returns (nil, nil) when no row is due.
func ClaimNextWebhookOutbox(ctx context.Context, db *gorm.DB, now time.Time) (*models.WebhookOutbox, error) {
	leaseUntil := now.UTC().Add(WebhookOutboxLease)
	var row models.WebhookOutbox
	err := db.WithContext(ctx).Raw(`
WITH cte AS (
	SELECT id FROM webhook_outbox
	WHERE (locked_until IS NULL OR locked_until < ?) AND next_attempt_at <= ?
	ORDER BY next_attempt_at ASC, created_at ASC
	LIMIT 1
	FOR UPDATE SKIP LOCKED
)
UPDATE webhook_outbox w
SET locked_until = ?
FROM cte
WHERE w.id = cte.id
RETURNING w.id, w.company_id, w.ticket_history_id, w.attempt_count, w.next_attempt_at, w.locked_until, w.created_at
`, now.UTC(), now.UTC(), leaseUntil).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, nil
	}
	return &row, nil
}

// WebhookOutboxReleaseSuccess deletes a successfully delivered outbox row.
func WebhookOutboxReleaseSuccess(ctx context.Context, db *gorm.DB, id string) error {
	return db.WithContext(ctx).Delete(&models.WebhookOutbox{}, "id = ?", id).Error
}

// WebhookOutboxScheduleRetry clears the lease and schedules the next attempt (or drops after max attempts).
func WebhookOutboxScheduleRetry(ctx context.Context, db *gorm.DB, id string, attemptCount int, nextAttempt time.Time, drop bool) error {
	if drop {
		return db.WithContext(ctx).Delete(&models.WebhookOutbox{}, "id = ?", id).Error
	}
	return db.WithContext(ctx).Model(&models.WebhookOutbox{}).Where("id = ?", id).Updates(map[string]interface{}{
		"locked_until":    nil,
		"attempt_count":   attemptCount,
		"next_attempt_at": nextAttempt.UTC(),
	}).Error
}
