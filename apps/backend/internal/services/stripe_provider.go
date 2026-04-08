package services

import (
	"encoding/json"
	"fmt"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"time"

	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/webhook"
)

type StripeProvider struct {
	secretKey      string
	webhookSecret  string
}

func NewStripeProvider(secretKey, webhookSecret string) PaymentProvider {
	stripe.Key = secretKey
	return &StripeProvider{
		secretKey:     secretKey,
		webhookSecret: webhookSecret,
	}
}

func (p *StripeProvider) CreateCheckoutSession(subscription *models.Subscription, successURL, cancelURL string) (string, error) {
	db := database.DB

	// Load the subscription with plan
	if err := db.Preload("Plan").Preload("Company").First(subscription, "id = ?", subscription.ID).Error; err != nil {
		return "", err
	}

	// Get or create Stripe customer
	customerID, err := p.GetCustomerID(subscription.CompanyID)
	if err != nil {
		// Create customer if not exists
		customerID, err = p.CreateCustomer(subscription.CompanyID, subscription.Company.BillingEmail, subscription.Company.Name)
		if err != nil {
			return "", fmt.Errorf("failed to create customer: %w", err)
		}
	}

	// Create checkout session
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency: stripe.String(subscription.Plan.Currency),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name: stripe.String(subscription.Plan.Name),
					},
					UnitAmount: stripe.Int64(subscription.Plan.Price),
					Recurring: &stripe.CheckoutSessionLineItemPriceDataRecurringParams{
						Interval: stripe.String(subscription.Plan.Interval),
					},
				},
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		Metadata: map[string]string{
			"subscription_id": subscription.ID,
			"company_id":      subscription.CompanyID,
		},
	}

	sess, err := session.New(params)
	if err != nil {
		return "", fmt.Errorf("failed to create checkout session: %w", err)
	}

	return sess.URL, nil
}

func (p *StripeProvider) CreateInvoice(subscription *models.Subscription) (*models.Invoice, error) {
	db := database.DB

	// Load subscription with plan
	if err := db.Preload("Plan").First(subscription, "id = ?", subscription.ID).Error; err != nil {
		return nil, err
	}

	invoice := &models.Invoice{
		CompanyID:       subscription.CompanyID,
		SubscriptionID:  subscription.ID,
		Amount:          subscription.Plan.Price,
		Currency:        subscription.Plan.Currency,
		Status:          "open",
		PaymentProvider: "stripe",
		DueDate:         subscription.CurrentPeriodEnd,
	}

	if err := db.Create(invoice).Error; err != nil {
		return nil, err
	}

	return invoice, nil
}

func (p *StripeProvider) HandleWebhook(payload []byte, signature string) error {
	event, err := webhook.ConstructEvent(payload, signature, p.webhookSecret)
	if err != nil {
		return fmt.Errorf("failed to verify webhook signature: %w", err)
	}

	switch event.Type {
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
			return fmt.Errorf("failed to unmarshal session: %w", err)
		}
		return p.handleCheckoutCompleted(&session)

	case "invoice.payment_succeeded":
		var invoice stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
			return fmt.Errorf("failed to unmarshal invoice: %w", err)
		}
		return p.handleInvoicePaymentSucceeded(&invoice)

	case "invoice.payment_failed":
		var invoice stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
			return fmt.Errorf("failed to unmarshal invoice: %w", err)
		}
		return p.handleInvoicePaymentFailed(&invoice)

	case "customer.subscription.deleted":
		var subscription stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &subscription); err != nil {
			return fmt.Errorf("failed to unmarshal subscription: %w", err)
		}
		return p.handleSubscriptionDeleted(&subscription)
	}

	return nil
}

func (p *StripeProvider) CancelSubscription(subscriptionID string) error {
	// In a real implementation, you would cancel the Stripe subscription here
	// For now, just mark it as canceled in our database
	db := database.DB
	
	return db.Model(&models.Subscription{}).
		Where("id = ?", subscriptionID).
		Updates(map[string]interface{}{
			"status":               "canceled",
			"cancel_at_period_end": true,
		}).Error
}

func (p *StripeProvider) GetCustomerID(companyID string) (string, error) {
	db := database.DB
	
	var company models.Company
	if err := db.Where("id = ?", companyID).First(&company).Error; err != nil {
		return "", err
	}

	// Parse metadata to get Stripe customer ID
	var metadata map[string]interface{}
	if company.Settings != nil {
		if err := json.Unmarshal(company.Settings, &metadata); err == nil {
			if customerID, ok := metadata["stripe_customer_id"].(string); ok {
				return customerID, nil
			}
		}
	}

	return "", fmt.Errorf("customer not found")
}

func (p *StripeProvider) CreateCustomer(companyID, email, name string) (string, error) {
	params := &stripe.CustomerParams{
		Email: stripe.String(email),
		Name:  stripe.String(name),
		Metadata: map[string]string{
			"company_id": companyID,
		},
	}

	cust, err := customer.New(params)
	if err != nil {
		return "", err
	}

	// Store customer ID in company metadata
	db := database.DB
	var company models.Company
	if err := db.Where("id = ?", companyID).First(&company).Error; err != nil {
		return "", err
	}

	var settings map[string]interface{}
	if company.Settings != nil {
		if err := json.Unmarshal(company.Settings, &settings); err != nil {
			settings = make(map[string]interface{})
		}
	} else {
		settings = make(map[string]interface{})
	}
	settings["stripe_customer_id"] = cust.ID

	settingsJSON, _ := json.Marshal(settings)
	db.Model(&company).Update("settings", settingsJSON)

	return cust.ID, nil
}

// Helper methods for webhook handlers

func (p *StripeProvider) handleCheckoutCompleted(session *stripe.CheckoutSession) error {
	subscriptionID := session.Metadata["subscription_id"]
	if subscriptionID == "" {
		return fmt.Errorf("subscription_id not found in metadata")
	}

	db := database.DB
	return db.Model(&models.Subscription{}).
		Where("id = ?", subscriptionID).
		Update("status", "active").Error
}

func (p *StripeProvider) handleInvoicePaymentSucceeded(stripeInvoice *stripe.Invoice) error {
	db := database.DB

	// Find our invoice by Stripe invoice ID
	var invoice models.Invoice
	if err := db.Where("payment_provider_invoice_id = ?", stripeInvoice.ID).First(&invoice).Error; err != nil {
		return err
	}

	now := time.Now()
	return db.Model(&invoice).Updates(map[string]interface{}{
		"status":  "paid",
		"paid_at": &now,
	}).Error
}

func (p *StripeProvider) handleInvoicePaymentFailed(stripeInvoice *stripe.Invoice) error {
	db := database.DB

	// Find our invoice by Stripe invoice ID
	var invoice models.Invoice
	if err := db.Where("payment_provider_invoice_id = ?", stripeInvoice.ID).First(&invoice).Error; err != nil {
		return err
	}

	// Update invoice status
	if err := db.Model(&invoice).Update("status", "uncollectible").Error; err != nil {
		return err
	}

	// Update subscription status to past_due
	return db.Model(&models.Subscription{}).
		Where("id = ?", invoice.SubscriptionID).
		Update("status", "past_due").Error
}

func (p *StripeProvider) handleSubscriptionDeleted(stripeSubscription *stripe.Subscription) error {
	companyID := stripeSubscription.Metadata["company_id"]
	if companyID == "" {
		return fmt.Errorf("company_id not found in metadata")
	}

	db := database.DB
	return db.Model(&models.Subscription{}).
		Where("company_id = ?", companyID).
		Update("status", "canceled").Error
}
