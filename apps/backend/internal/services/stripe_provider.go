package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
	"strings"
	"time"

	"github.com/stripe/stripe-go/v76"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/invoice"
	"github.com/stripe/stripe-go/v76/invoiceitem"
	stripesub "github.com/stripe/stripe-go/v76/subscription"
	"github.com/stripe/stripe-go/v76/webhook"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrStripeCustomerNotFound is returned when a company has no Stripe customer id in settings.
var ErrStripeCustomerNotFound = errors.New("stripe customer not found for company")

type StripeProvider struct {
	secretKey     string
	webhookSecret string
}

func NewStripeProvider(secretKey, webhookSecret string) PaymentProvider {
	stripe.Key = secretKey
	return &StripeProvider{
		secretKey:     secretKey,
		webhookSecret: webhookSecret,
	}
}

func (p *StripeProvider) CreateCheckoutSession(ctx context.Context, subscription *models.Subscription, checkoutPlan *models.SubscriptionPlan, successURL, cancelURL string) (string, string, error) {
	db := database.DB.WithContext(ctx)

	// Load the subscription with plan and company
	if err := db.Preload("Plan").Preload("Company").First(subscription, "id = ?", subscription.ID).Error; err != nil {
		return "", "", err
	}

	pricePlan := checkoutPlan
	if pricePlan == nil {
		pricePlan = &subscription.Plan
	}

	customerID, err := p.GetCustomerID(ctx, subscription.CompanyID)
	if err != nil {
		if errors.Is(err, ErrStripeCustomerNotFound) {
			customerID, err = p.CreateCustomer(ctx, subscription.CompanyID, subscription.Company.BillingEmail, subscription.Company.Name)
			if err != nil {
				return "", "", fmt.Errorf("failed to create customer: %w", err)
			}
		} else {
			return "", "", fmt.Errorf("get stripe customer: %w", err)
		}
	}

	// Create checkout session
	params := &stripe.CheckoutSessionParams{
		Params: stripe.Params{
			Context: ctx,
		},
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency: stripe.String(pricePlan.Currency),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name: stripe.String(pricePlan.Name),
					},
					UnitAmount: stripe.Int64(pricePlan.Price),
					Recurring: &stripe.CheckoutSessionLineItemPriceDataRecurringParams{
						Interval: stripe.String(pricePlan.Interval),
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
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: map[string]string{
				"company_id":      subscription.CompanyID,
				"subscription_id": subscription.ID,
			},
		},
	}
	if checkoutPlan != nil {
		params.Metadata["checkout_plan_id"] = checkoutPlan.ID
		params.Metadata["checkout_plan_code"] = checkoutPlan.Code
		params.SubscriptionData.Metadata["checkout_plan_id"] = checkoutPlan.ID
		params.SubscriptionData.Metadata["checkout_plan_code"] = checkoutPlan.Code
	}

	sess, err := session.New(params)
	if err != nil {
		return "", "", fmt.Errorf("failed to create checkout session: %w", err)
	}

	return sess.URL, sess.ID, nil
}

func (p *StripeProvider) CreateInvoice(ctx context.Context, subscription *models.Subscription) (*models.Invoice, error) {
	db := database.DB.WithContext(ctx)

	if err := db.Preload("Plan").Preload("Company").First(subscription, "id = ?", subscription.ID).Error; err != nil {
		return nil, err
	}

	customerID, err := p.GetCustomerID(ctx, subscription.CompanyID)
	if err != nil {
		if !errors.Is(err, ErrStripeCustomerNotFound) {
			return nil, fmt.Errorf("get stripe customer: %w", err)
		}
		customerID, err = p.CreateCustomer(ctx, subscription.CompanyID, subscription.Company.BillingEmail, subscription.Company.Name)
		if err != nil {
			return nil, fmt.Errorf("failed to ensure stripe customer: %w", err)
		}
	}

	currency := strings.ToLower(strings.TrimSpace(subscription.Plan.Currency))
	if currency == "" {
		currency = "usd"
	}

	_, err = invoiceitem.New(&stripe.InvoiceItemParams{
		Params: stripe.Params{
			Context: ctx,
		},
		Customer:    stripe.String(customerID),
		Amount:      stripe.Int64(subscription.Plan.Price),
		Currency:    stripe.String(currency),
		Description: stripe.String(subscription.Plan.Name),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create stripe invoice line item: %w", err)
	}

	stripeInv, err := invoice.New(&stripe.InvoiceParams{
		Params: stripe.Params{
			Context: ctx,
		},
		Customer:         stripe.String(customerID),
		CollectionMethod: stripe.String(string(stripe.InvoiceCollectionMethodChargeAutomatically)),
		AutoAdvance:      stripe.Bool(true),
		Currency:         stripe.String(currency),
		Description:      stripe.String(fmt.Sprintf("QuokkaQ subscription invoice (%s)", subscription.Plan.Name)),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create stripe invoice: %w", err)
	}

	status := "open"
	switch stripeInv.Status {
	case stripe.InvoiceStatusPaid:
		status = "paid"
	case stripe.InvoiceStatusOpen:
		status = "open"
	case stripe.InvoiceStatusDraft:
		status = "draft"
	case stripe.InvoiceStatusVoid:
		status = "void"
	case stripe.InvoiceStatusUncollectible:
		status = "uncollectible"
	}

	cid := subscription.CompanyID
	sid := subscription.ID
	local := &models.Invoice{
		CompanyID:                &cid,
		SubscriptionID:           &sid,
		Amount:                   subscription.Plan.Price,
		Currency:                 subscription.Plan.Currency,
		Status:                   status,
		PaymentProvider:          "stripe",
		PaymentProviderInvoiceID: stripeInv.ID,
		DueDate:                  subscription.CurrentPeriodEnd,
	}

	if err := db.Create(local).Error; err != nil {
		return nil, err
	}

	return local, nil
}

func (p *StripeProvider) HandleWebhook(ctx context.Context, payload []byte, signature string) error {
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
		return p.handleCheckoutCompleted(ctx, &session)

	case "invoice.payment_succeeded":
		var invoice stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
			return fmt.Errorf("failed to unmarshal invoice: %w", err)
		}
		return p.handleInvoicePaymentSucceeded(ctx, &invoice)

	case "invoice.payment_failed":
		var invoice stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
			return fmt.Errorf("failed to unmarshal invoice: %w", err)
		}
		return p.handleInvoicePaymentFailed(ctx, &invoice)

	case "customer.subscription.deleted":
		var subscription stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &subscription); err != nil {
			return fmt.Errorf("failed to unmarshal subscription: %w", err)
		}
		return p.handleSubscriptionDeleted(ctx, &subscription)
	}

	return nil
}

func (p *StripeProvider) CancelSubscription(ctx context.Context, subscriptionID string) error {
	db := database.DB.WithContext(ctx)

	var sub models.Subscription
	if err := db.First(&sub, "id = ?", subscriptionID).Error; err != nil {
		return fmt.Errorf("load subscription: %w", err)
	}

	if sub.StripeSubscriptionID == nil || strings.TrimSpace(*sub.StripeSubscriptionID) == "" {
		return fmt.Errorf("subscription has no linked Stripe subscription ID")
	}
	stripeSubID := strings.TrimSpace(*sub.StripeSubscriptionID)

	_, err := stripesub.Update(stripeSubID, &stripe.SubscriptionParams{
		Params: stripe.Params{
			Context: ctx,
		},
		CancelAtPeriodEnd: stripe.Bool(true),
	})
	if err != nil {
		return fmt.Errorf("stripe subscription cancel-at-period-end: %w", err)
	}

	if err := db.Model(&models.Subscription{}).
		Where("id = ?", subscriptionID).
		Updates(map[string]interface{}{
			"cancel_at_period_end": true,
		}).Error; err != nil {
		return fmt.Errorf("update local subscription after Stripe: %w", err)
	}

	return nil
}

func (p *StripeProvider) GetCustomerID(ctx context.Context, companyID string) (string, error) {
	db := database.DB.WithContext(ctx)

	var company models.Company
	if err := db.Where("id = ?", companyID).First(&company).Error; err != nil {
		return "", err
	}

	var metadata map[string]interface{}
	if company.Settings != nil {
		if err := json.Unmarshal(company.Settings, &metadata); err == nil {
			if customerID, ok := metadata["stripe_customer_id"].(string); ok && customerID != "" {
				return customerID, nil
			}
		}
	}

	return "", ErrStripeCustomerNotFound
}

func (p *StripeProvider) CreateCustomer(ctx context.Context, companyID, email, name string) (createdID string, err error) {
	params := &stripe.CustomerParams{
		Params: stripe.Params{
			Context: ctx,
		},
		Email: stripe.String(email),
		Name:  stripe.String(name),
		Metadata: map[string]string{
			"company_id": companyID,
		},
	}

	err = database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var company models.Company
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", companyID).First(&company).Error; err != nil {
			return err
		}

		var settings map[string]interface{}
		if company.Settings != nil {
			if err := json.Unmarshal(company.Settings, &settings); err != nil {
				settings = make(map[string]interface{})
			}
		} else {
			settings = make(map[string]interface{})
		}
		if id, ok := settings["stripe_customer_id"].(string); ok && id != "" {
			createdID = id
			return nil
		}

		cust, err := customer.New(params)
		if err != nil {
			return err
		}
		settings["stripe_customer_id"] = cust.ID
		settingsJSON, err := json.Marshal(settings)
		if err != nil {
			return fmt.Errorf("marshal company settings: %w", err)
		}
		if err := tx.Model(&company).Update("settings", settingsJSON).Error; err != nil {
			return fmt.Errorf("update company settings: %w", err)
		}
		createdID = cust.ID
		return nil
	})
	return createdID, err
}

// Helper methods for webhook handlers

func (p *StripeProvider) handleCheckoutCompleted(ctx context.Context, session *stripe.CheckoutSession) error {
	subscriptionID := session.Metadata["subscription_id"]
	if subscriptionID == "" {
		return fmt.Errorf("subscription_id not found in metadata")
	}

	db := database.DB.WithContext(ctx)
	updates := map[string]interface{}{"status": "active"}
	if session.Subscription != nil && session.Subscription.ID != "" {
		updates["stripe_subscription_id"] = session.Subscription.ID
	}

	return db.Model(&models.Subscription{}).
		Where("id = ?", subscriptionID).
		Updates(updates).Error
}

func (p *StripeProvider) handleInvoicePaymentSucceeded(ctx context.Context, stripeInvoice *stripe.Invoice) error {
	db := database.DB.WithContext(ctx)

	invoice, err := p.ensureLocalInvoiceForStripeWebhook(ctx, db, stripeInvoice)
	if err != nil {
		return err
	}

	now := time.Now()
	return db.Model(invoice).Updates(map[string]interface{}{
		"status":  "paid",
		"paid_at": &now,
	}).Error
}

func (p *StripeProvider) handleInvoicePaymentFailed(ctx context.Context, stripeInvoice *stripe.Invoice) error {
	db := database.DB.WithContext(ctx)

	invoice, err := p.ensureLocalInvoiceForStripeWebhook(ctx, db, stripeInvoice)
	if err != nil {
		return err
	}

	if err := db.Model(invoice).Update("status", "uncollectible").Error; err != nil {
		return err
	}

	if invoice.SubscriptionID == nil || strings.TrimSpace(*invoice.SubscriptionID) == "" {
		return nil
	}
	return db.Model(&models.Subscription{}).
		Where("id = ?", *invoice.SubscriptionID).
		Update("status", "past_due").Error
}

func (p *StripeProvider) handleSubscriptionDeleted(ctx context.Context, stripeSubscription *stripe.Subscription) error {
	if stripeSubscription.ID == "" {
		return fmt.Errorf("stripe subscription id is empty")
	}
	companyID := stripeSubscription.Metadata["company_id"]
	if companyID == "" {
		return fmt.Errorf("company_id not found in metadata")
	}

	db := database.DB.WithContext(ctx)
	return db.Model(&models.Subscription{}).
		Where("company_id = ? AND stripe_subscription_id = ?", companyID, stripeSubscription.ID).
		Update("status", "canceled").Error
}

func stripeInvoiceSubscriptionID(inv *stripe.Invoice) string {
	if inv == nil || inv.Subscription == nil {
		return ""
	}
	return inv.Subscription.ID
}

func stripeInvoiceDueDate(inv *stripe.Invoice) time.Time {
	if inv.DueDate > 0 {
		return time.Unix(inv.DueDate, 0).UTC()
	}
	if inv.Created > 0 {
		return time.Unix(inv.Created, 0).UTC()
	}
	return time.Now().UTC()
}

func stripeInvoiceAmountMinor(inv *stripe.Invoice) int64 {
	if inv == nil {
		return 0
	}
	if inv.Total > 0 {
		return inv.Total
	}
	if inv.AmountDue > 0 {
		return inv.AmountDue
	}
	return inv.AmountPaid
}

// ensureLocalInvoiceForStripeWebhook returns an invoice row keyed by Stripe invoice id, creating one from the Stripe payload and local subscription when missing.
func (p *StripeProvider) ensureLocalInvoiceForStripeWebhook(ctx context.Context, db *gorm.DB, stripeInvoice *stripe.Invoice) (*models.Invoice, error) {
	_ = ctx
	var existing models.Invoice
	err := db.Where("payment_provider_invoice_id = ?", stripeInvoice.ID).First(&existing).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	stripeSubID := stripeInvoiceSubscriptionID(stripeInvoice)
	if stripeSubID == "" {
		return nil, fmt.Errorf("stripe invoice %s has no subscription id", stripeInvoice.ID)
	}

	var sub models.Subscription
	if err := db.Where("stripe_subscription_id = ?", stripeSubID).First(&sub).Error; err != nil {
		return nil, fmt.Errorf("local subscription for stripe sub %s: %w", stripeSubID, err)
	}

	cid := sub.CompanyID
	sid := sub.ID
	amount := stripeInvoiceAmountMinor(stripeInvoice)
	cur := strings.ToUpper(string(stripeInvoice.Currency))

	rec := models.Invoice{
		CompanyID:                &cid,
		SubscriptionID:           &sid,
		Amount:                   amount,
		Currency:                 cur,
		Status:                   "open",
		PaymentProvider:          "stripe",
		PaymentProviderInvoiceID: stripeInvoice.ID,
		DueDate:                  stripeInvoiceDueDate(stripeInvoice),
	}
	if err := db.Create(&rec).Error; err != nil {
		if err2 := db.Where("payment_provider_invoice_id = ?", stripeInvoice.ID).First(&existing).Error; err2 == nil {
			return &existing, nil
		}
		return nil, err
	}
	return &rec, nil
}
