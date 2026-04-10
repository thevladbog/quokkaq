package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/services/billing"

	"gorm.io/gorm"
)

// YooKassaWebhookNotification is the JSON envelope YooKassa sends for HTTP notifications.
// The handler acts on event payment.succeeded and reads invoice_id from the nested Payment metadata.
type YooKassaWebhookNotification struct {
	Event  string          `json:"event" example:"payment.succeeded"`
	Object json.RawMessage `json:"object" swaggertype:"object"`
}

// ServeYooKassaWebhook godoc
// @Summary      YooKassa payment webhook
// @Description  Receives YooKassa HTTP notifications. Verifies HMAC-SHA256 using X-YooMoney-Signature, then processes payment.succeeded when metadata contains invoice_id (platform invoice paid flow).
// @Tags         webhooks
// @Accept       json
// @Produce      json
// @Param        Content-Type           header    string                        true  "Must be application/json"
// @Param        X-YooMoney-Signature   header    string                        true  "Webhook HMAC-SHA256 digest (hex, optional sha256= prefix)"
// @Param        body                   body      YooKassaWebhookNotification   true  "YooKassa notification JSON (event + object)"
// @Success      200  "Empty response body"
// @Failure      400  {string}  string  "Bad request"
// @Failure      401  {string}  string  "Invalid or missing signature"
// @Failure      405  {string}  string  "Method not allowed"
// @Failure      500  {string}  string  "Internal server error"
// @Failure      503  {string}  string  "Service unavailable (webhook signing secret not configured)"
// @Router       /webhooks/yookassa [post]
func ServeYooKassaWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	secret := strings.TrimSpace(os.Getenv("YOOKASSA_WEBHOOK_SECRET"))
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("YOOKASSA_SECRET_KEY"))
	}
	if secret == "" {
		log.Printf("YooKassa webhook: rejecting request: signing secret is empty (set YOOKASSA_WEBHOOK_SECRET or YOOKASSA_SECRET_KEY)")
		http.Error(w, "Service unavailable", http.StatusServiceUnavailable)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	sig := r.Header.Get("X-YooMoney-Signature")
	if err := billing.VerifyYooKassaWebhookSignature(body, sig, secret); err != nil {
		log.Printf("YooKassa webhook signature: %v", err)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	ctx := r.Context()
	if err := billing.HandleYooKassaNotification(ctx, body, func(tx *gorm.DB, invoiceID, paymentID string, paidAt time.Time) error {
		return applyYooKassaInvoicePaid(tx, invoiceID, paymentID, paidAt, time.Now().UTC())
	}); err != nil {
		log.Printf("YooKassa webhook: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
