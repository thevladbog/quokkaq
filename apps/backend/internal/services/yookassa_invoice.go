package services

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	yookassa "github.com/rvinnie/yookassa-sdk-go/yookassa"
	yoocommon "github.com/rvinnie/yookassa-sdk-go/yookassa/common"
	yoopayment "github.com/rvinnie/yookassa-sdk-go/yookassa/payment"
	yoowebhook "github.com/rvinnie/yookassa-sdk-go/yookassa/webhook"
	"gorm.io/gorm"
)

// YooKassaInvoiceClient creates one-off payments for manual/platform invoices (metadata invoice_id).
type YooKassaInvoiceClient struct {
	client        *yookassa.Client
	shopID        string
	webhookSecret string
}

func NewYooKassaInvoiceClient(shopID, secretKey, webhookSecret string) *YooKassaInvoiceClient {
	if webhookSecret == "" {
		webhookSecret = secretKey
	}
	return &YooKassaInvoiceClient{
		client:        yookassa.NewClient(shopID, secretKey),
		shopID:        shopID,
		webhookSecret: webhookSecret,
	}
}

func (c *YooKassaInvoiceClient) Configured() bool {
	return c != nil && strings.TrimSpace(c.shopID) != "" && c.client != nil
}

// CreatePayment builds a YooKassa payment for invoice total; idempotency key = invoice ID.
func (c *YooKassaInvoiceClient) CreatePayment(ctx context.Context, inv *models.Invoice, returnURL string) (paymentID, confirmationURL string, err error) {
	if !c.Configured() {
		return "", "", fmt.Errorf("yookassa is not configured")
	}
	if inv.CompanyID == nil || strings.TrimSpace(*inv.CompanyID) == "" {
		return "", "", fmt.Errorf("invoice has no company")
	}
	if inv.Amount <= 0 {
		return "", "", fmt.Errorf("invoice amount must be positive")
	}
	doc := ""
	if inv.DocumentNumber != nil {
		doc = strings.TrimSpace(*inv.DocumentNumber)
	}
	var desc string
	if doc != "" {
		desc = fmt.Sprintf("Оплата счёта %s", doc)
	} else {
		desc = fmt.Sprintf("Оплата счёта %s", inv.ID)
	}
	if returnURL == "" {
		returnURL = "https://example.com/payment-return"
	}

	payment := &yoopayment.Payment{
		Amount: &yoocommon.Amount{
			Value:    fmt.Sprintf("%.2f", float64(inv.Amount)/100.0),
			Currency: strings.ToUpper(inv.Currency),
		},
		Confirmation: &yoopayment.Redirect{
			Type:      yoopayment.TypeRedirect,
			ReturnURL: returnURL,
		},
		Description: desc,
		Metadata: map[string]string{
			"invoice_id": inv.ID,
			"company_id": *inv.CompanyID,
		},
		Capture: true,
	}

	payHandler := yookassa.NewPaymentHandler(c.client).WithIdempotencyKey(inv.ID)
	created, err := payHandler.CreatePayment(ctx, payment)
	if err != nil {
		return "", "", err
	}
	if created == nil {
		return "", "", fmt.Errorf("empty payment response")
	}
	url := yooRedirectURL(created)
	if url == "" {
		return "", "", fmt.Errorf("no confirmation URL in payment response")
	}
	return created.ID, url, nil
}

func yooRedirectURL(p *yoopayment.Payment) string {
	if p == nil || p.Confirmation == nil {
		return ""
	}
	if redir, ok := p.Confirmation.(*yoopayment.Redirect); ok && redir != nil {
		return redir.ConfirmationURL
	}
	return ""
}

// VerifyYooKassaWebhookSignature checks HMAC-SHA256(payload, secret) against signature header.
func VerifyYooKassaWebhookSignature(payload []byte, signature, secret string) error {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return fmt.Errorf("webhook secret not configured")
	}
	sigInput := strings.TrimSpace(signature)
	if sigInput == "" {
		return fmt.Errorf("missing webhook signature")
	}
	if len(sigInput) >= 7 && strings.EqualFold(sigInput[:7], "sha256=") {
		sigInput = strings.TrimSpace(sigInput[7:])
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := mac.Sum(nil)
	if provided, err := hex.DecodeString(sigInput); err == nil && len(provided) == len(expected) {
		if subtle.ConstantTimeCompare(provided, expected) == 1 {
			return nil
		}
		return fmt.Errorf("invalid webhook signature")
	}
	if provided, err := base64.StdEncoding.DecodeString(sigInput); err == nil && len(provided) == len(expected) {
		if subtle.ConstantTimeCompare(provided, expected) == 1 {
			return nil
		}
		return fmt.Errorf("invalid webhook signature")
	}
	return fmt.Errorf("invalid webhook signature format")
}

// HandleYooKassaNotification processes payment.succeeded for invoice_id metadata.
func HandleYooKassaNotification(ctx context.Context, payload []byte, applyPaid func(tx *gorm.DB, invoiceID, paymentID string, paidAt time.Time) error) error {
	var envelope struct {
		Event  yoowebhook.WebhookEventType `json:"event"`
		Object json.RawMessage             `json:"object"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return fmt.Errorf("unmarshal notification: %w", err)
	}
	if envelope.Event != yoowebhook.EventPaymentSucceeded {
		return nil
	}
	var pay yoopayment.Payment
	if err := json.Unmarshal(envelope.Object, &pay); err != nil {
		return fmt.Errorf("unmarshal payment: %w", err)
	}
	invoiceID := ""
	if m, ok := pay.Metadata.(map[string]interface{}); ok {
		if v, ok := m["invoice_id"].(string); ok {
			invoiceID = strings.TrimSpace(v)
		}
	}
	if invoiceID == "" {
		return nil
	}
	paidAt := time.Now().UTC()
	if pay.CapturedAt != nil {
		paidAt = pay.CapturedAt.UTC()
	}
	return database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return applyPaid(tx, invoiceID, pay.ID, paidAt)
	})
}
