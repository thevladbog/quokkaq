package jobs

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
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
	"gorm.io/gorm/clause"
)

const maxWebhookResponseLog = 500
const webhookHTTPTimeout = 12 * time.Second

func (w *jobWorker) handleWebhookFlushOutbox(ctx context.Context, _ *asynq.Task) error {
	db := database.DB
	if db == nil {
		return nil
	}
	epRepo := repository.NewWebhookEndpointRepository(db)
	for step := 0; step < 50; step++ {
		var ob models.WebhookOutbox
		err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			return tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
				Order("created_at ASC").Limit(1).First(&ob).Error
		})
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}

		var hist models.TicketHistory
		if err := db.WithContext(ctx).Where("id = ?", ob.TicketHistoryID).First(&hist).Error; err != nil {
			_ = db.WithContext(ctx).Delete(&models.WebhookOutbox{}, "id = ?", ob.ID).Error
			continue
		}

		var unitID string
		if err := db.WithContext(ctx).Raw(`SELECT unit_id FROM tickets WHERE id = ? LIMIT 1`, hist.TicketID).Scan(&unitID).Error; err != nil {
			unitID = ""
		}

		endpoints, err := epRepo.ListEnabledForCompanyAndEvent(ctx, ob.CompanyID, unitID, hist.Action)
		if err != nil {
			applogger.ErrorfCtx(ctx, "webhook flush: list endpoints: %v", err)
			return err
		}
		if len(endpoints) == 0 {
			_ = db.WithContext(ctx).Delete(&models.WebhookOutbox{}, "id = ?", ob.ID).Error
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
			_ = db.WithContext(ctx).Delete(&models.WebhookOutbox{}, "id = ?", ob.ID).Error
			continue
		}

		allOK := true
		for j := range endpoints {
			ep := &endpoints[j]
			if !netutil.WebhookTargetURLAllowed(ep.URL) {
				allOK = false
				_ = logWebhookDelivery(ctx, db, ep.ID, &hist.ID, nil, "", 0, "blocked URL (SSRF guard)", 1)
				_ = epRepo.IncrementFailures(ctx, ep.ID, 1)
				continue
			}
			status, snippet, dur, sendErr := postWebhookSigned(ctx, ep.URL, raw, ep.SigningSecret)
			if sendErr != nil || status < 200 || status > 299 {
				allOK = false
				msg := ""
				if sendErr != nil {
					msg = sendErr.Error()
				} else {
					msg = fmt.Sprintf("HTTP %d", status)
				}
				st := status
				_ = logWebhookDelivery(ctx, db, ep.ID, &hist.ID, &st, snippet, dur, msg, 1)
				_ = epRepo.IncrementFailures(ctx, ep.ID, 1)
			} else {
				st := status
				_ = logWebhookDelivery(ctx, db, ep.ID, &hist.ID, &st, snippet, dur, "", 1)
				_ = epRepo.ResetFailures(ctx, ep.ID)
			}
		}
		if allOK {
			_ = db.WithContext(ctx).Delete(&models.WebhookOutbox{}, "id = ?", ob.ID).Error
		}
	}
	return nil
}

func logWebhookDelivery(ctx context.Context, db *gorm.DB, endpointID string, historyID *string, status *int, snippet string, durMs int, errMsg string, attempt int) error {
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

func postWebhookSigned(ctx context.Context, targetURL string, body []byte, secret string) (status int, snippet string, durMs int, err error) {
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
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, maxWebhookResponseLog+1))
	snippet = strings.TrimSpace(string(b))
	return resp.StatusCode, snippet, durMs, nil
}
