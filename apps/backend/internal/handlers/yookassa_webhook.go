package handlers

import (
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"quokkaq-go-backend/internal/services"

	"gorm.io/gorm"
)

// ServeYooKassaWebhook handles YooKassa HTTP notifications (payment.succeeded for platform invoices).
func ServeYooKassaWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	secret := strings.TrimSpace(os.Getenv("YOOKASSA_WEBHOOK_SECRET"))
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("YOOKASSA_SECRET_KEY"))
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	sig := r.Header.Get("X-YooMoney-Signature")
	if secret != "" {
		if err := services.VerifyYooKassaWebhookSignature(body, sig, secret); err != nil {
			log.Printf("YooKassa webhook signature: %v", err)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}
	ctx := r.Context()
	if err := services.HandleYooKassaNotification(ctx, body, func(tx *gorm.DB, invoiceID, paymentID string, paidAt time.Time) error {
		return applyYooKassaInvoicePaid(tx, invoiceID, paymentID, paidAt, time.Now().UTC())
	}); err != nil {
		log.Printf("YooKassa webhook: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
