package services

import (
	"quokkaq-go-backend/internal/models"
)

// PaymentProvider is an interface for payment integrations
type PaymentProvider interface {
	// CreateCheckoutSession creates a new checkout session for subscription payment
	CreateCheckoutSession(subscription *models.Subscription, successURL, cancelURL string) (string, error)

	// CreateInvoice creates a new invoice for a subscription
	CreateInvoice(subscription *models.Subscription) (*models.Invoice, error)

	// HandleWebhook processes webhook events from the payment provider
	HandleWebhook(payload []byte, signature string) error

	// CancelSubscription cancels a subscription in the payment provider
	CancelSubscription(subscriptionID string) error

	// GetCustomerID returns the payment provider's customer ID for a company
	GetCustomerID(companyID string) (string, error)

	// CreateCustomer creates a new customer in the payment provider
	CreateCustomer(companyID, email, name string) (string, error)
}

// PaymentWebhookEvent represents a webhook event from a payment provider
type PaymentWebhookEvent struct {
	Type           string
	SubscriptionID string
	InvoiceID      string
	Status         string
	Amount         int64
	Currency       string
	PaidAt         *string
}
