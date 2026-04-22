package services

import (
	"context"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/subscriptionplan"
)

// PaymentProvider is an interface for payment integrations
type PaymentProvider interface {
	// CreateCheckoutSession creates a new checkout session for subscription payment.
	// If checkoutPlan is non-nil, its price/currency/interval are used for the session (e.g. plan upgrade),
	// unless stripeLine is non-nil (annual prepay: overrides unit amount, interval, product label).
	// If checkoutPlan is nil, the subscription's preloaded Plan from the database is used.
	// lineQuantity is Stripe line item quantity (per_unit: active subdivisions, lower bound 1 when count is zero).
	CreateCheckoutSession(ctx context.Context, subscription *models.Subscription, checkoutPlan *models.SubscriptionPlan, stripeLine *subscriptionplan.CheckoutSubscriptionLine, lineQuantity int64, successURL, cancelURL string) (checkoutURL string, sessionID string, err error)

	// CreateInvoice creates a new invoice for a subscription
	CreateInvoice(ctx context.Context, subscription *models.Subscription) (*models.Invoice, error)

	// HandleWebhook processes webhook events from the payment provider
	HandleWebhook(ctx context.Context, payload []byte, signature string) error

	// CancelSubscription cancels a subscription in the payment provider
	CancelSubscription(ctx context.Context, subscriptionID string) error

	// GetCustomerID returns the payment provider's customer ID for a company
	GetCustomerID(ctx context.Context, companyID string) (string, error)

	// CreateCustomer creates a new customer in the payment provider
	CreateCustomer(ctx context.Context, companyID, email, name string) (string, error)
}

// PaymentWebhookEvent represents a webhook event from a payment provider
type PaymentWebhookEvent struct {
	Type           string
	SubscriptionID string
	InvoiceID      string
	Status         string
	Amount         int64
	Currency       string
	PaidAt         *time.Time
}
