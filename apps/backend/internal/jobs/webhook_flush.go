package jobs

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	applogger "quokkaq-go-backend/internal/logger"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/netutil"
	"quokkaq-go-backend/internal/repository"
	"quokkaq-go-backend/pkg/database"

	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

const maxWebhookResponseLog = 500
const webhookHTTPTimeout = 12 * time.Second
const maxWebhookOutboxAttempts = 32

func webhookOutboxBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	pow := attempt
	if pow > 10 {
		pow = 10
	}
	sec := 1 << uint(pow)
	if sec > 300 {
		sec = 300
	}
	return time.Duration(sec) * time.Second
}

func (w *jobWorker) handleWebhookFlushOutbox(ctx context.Context, _ *asynq.Task) error {
	db := database.DB
	if db == nil {
		return nil
	}
	epRepo := repository.NewWebhookEndpointRepository(db)
	for step := 0; step < 50; step++ {
		ob, err := repository.ClaimNextWebhookOutbox(ctx, db, time.Now())
		if err != nil {
			return err
		}
		if ob == nil {
			return nil
		}

		var hist models.TicketHistory
		if err := db.WithContext(ctx).Where("id = ?", ob.TicketHistoryID).First(&hist).Error; err != nil {
			_ = repository.WebhookOutboxReleaseSuccess(ctx, db, ob.ID)
			continue
		}

		var unitID string
		if err := db.WithContext(ctx).Raw(`SELECT unit_id FROM tickets WHERE id = ? LIMIT 1`, hist.TicketID).Scan(&unitID).Error; err != nil {
			unitID = ""
		}

		endpoints, err := epRepo.ListEnabledForCompanyAndEvent(ctx, ob.CompanyID, unitID, hist.Action)
		if err != nil {
			applogger.ErrorfCtx(ctx, "webhook flush: list endpoints: %v", err)
			_ = repository.WebhookOutboxScheduleRetry(ctx, db, ob.ID, ob.AttemptCount, time.Now().UTC().Add(30*time.Second), false)
			return err
		}
		if len(endpoints) == 0 {
			_ = repository.WebhookOutboxReleaseSuccess(ctx, db, ob.ID)
			continue
		}

		body := map[string]interface{}{
			"id":        hist.ID,
			"type":      hist.Action,
			"ticketId":  hist.TicketID,
			"createdAt": hist.CreatedAt.UTC().Format(time.RFC3339Nano),
		}
		var payloadObj map[string]interface{}
		if len(hist.Payload) > 0 && string(hist.Payload) != "null" {
			if json.Unmarshal(hist.Payload, &payloadObj) == nil {
				body["payload"] = payloadObj
			}
		}
		raw, err := json.Marshal(body)
		if err != nil {
			applogger.ErrorfCtx(ctx, "webhook flush: marshal: %v", err)
			_ = repository.WebhookOutboxReleaseSuccess(ctx, db, ob.ID)
			continue
		}

		allOK := true
		for j := range endpoints {
			ep := &endpoints[j]
			if !netutil.WebhookTargetURLAllowed(ep.URL) {
				allOK = false
				_ = LogWebhookDelivery(ctx, db, ep.ID, &hist.ID, nil, "", 0, "blocked URL (SSRF guard)", ob.AttemptCount+1)
				_ = epRepo.IncrementFailures(ctx, ep.ID, 1)
				continue
			}
			status, snippet, dur, sendErr := PostWebhookSigned(ctx, ep.URL, raw, ep.SigningSecret)
			if sendErr != nil || status < 200 || status > 299 {
				allOK = false
				msg := ""
				if sendErr != nil {
					msg = sendErr.Error()
				} else {
					msg = fmt.Sprintf("HTTP %d", status)
				}
				st := status
				_ = LogWebhookDelivery(ctx, db, ep.ID, &hist.ID, &st, snippet, dur, msg, ob.AttemptCount+1)
				_ = epRepo.IncrementFailures(ctx, ep.ID, 1)
			} else {
				st := status
				_ = LogWebhookDelivery(ctx, db, ep.ID, &hist.ID, &st, snippet, dur, "", ob.AttemptCount+1)
				_ = epRepo.ResetFailures(ctx, ep.ID)
			}
		}

		if allOK {
			_ = repository.WebhookOutboxReleaseSuccess(ctx, db, ob.ID)
			continue
		}

		nextAttempt := ob.AttemptCount + 1
		if nextAttempt >= maxWebhookOutboxAttempts {
			applogger.PrintfCtx(ctx, "webhook outbox DLQ: dropped after %d attempts companyId=%s ticketHistoryId=%s outboxId=%s",
				maxWebhookOutboxAttempts, ob.CompanyID, ob.TicketHistoryID, ob.ID)
			_ = repository.WebhookOutboxScheduleRetry(ctx, db, ob.ID, nextAttempt, time.Now().UTC(), true)
			continue
		}
		when := time.Now().UTC().Add(webhookOutboxBackoff(nextAttempt))
		_ = repository.WebhookOutboxScheduleRetry(ctx, db, ob.ID, nextAttempt, when, false)
	}
	return nil
}

// LogWebhookDelivery persists one delivery attempt row (worker or admin test ping).
func LogWebhookDelivery(ctx context.Context, db *gorm.DB, endpointID string, historyID *string, status *int, snippet string, durMs int, errMsg string, attempt int) error {
	row := models.WebhookDeliveryLog{
		WebhookEndpointID: endpointID,
		TicketHistoryID:   historyID,
		HTTPStatus:        status,
		ResponseSnippet:   truncateStr(snippet, maxWebhookResponseLog),
		DurationMs:        durMs,
		ErrorMessage:      truncateStr(errMsg, 2000),
		Attempt:           attempt,
	}
	return db.WithContext(ctx).Create(&row).Error
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// PostWebhookSigned performs a single signed POST (used by workers and admin test pings).
func PostWebhookSigned(ctx context.Context, targetURL string, body []byte, secret string) (status int, snippet string, durMs int, err error) {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(body))
	if err != nil {
		return 0, "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-QuokkaQ-Signature", "sha256="+sig)
	req.Header.Set("User-Agent", "QuokkaQ-Webhooks/1.0")

	client := &http.Client{Timeout: webhookHTTPTimeout}
	start := time.Now()
	resp, err := client.Do(req)
	durMs = int(time.Since(start).Milliseconds())
	if err != nil {
		return 0, "", durMs, err
	}
	defer func() { _ = resp.Body.Close() }()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, maxWebhookResponseLog+1))
	snippet = strings.TrimSpace(string(b))
	return resp.StatusCode, snippet, durMs, nil
}
