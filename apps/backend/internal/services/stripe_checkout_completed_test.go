package services

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	glebarezsqlite "github.com/glebarez/sqlite"
	"github.com/stripe/stripe-go/v76"
	"gorm.io/gorm"
)

func TestStripeProvider_handleCheckoutCompleted_mergesAnnualMetadata(t *testing.T) {
	prev := database.DB
	t.Cleanup(func() { database.DB = prev })

	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	database.DB = db
	if err := db.AutoMigrate(&models.Subscription{}); err != nil {
		t.Fatal(err)
	}

	now := time.Now().UTC()
	sub := models.Subscription{
		ID:                 "sub-test-1",
		CompanyID:          "co-1",
		PlanID:             "plan-1",
		Status:             "trial",
		CurrentPeriodStart: now,
		CurrentPeriodEnd:   now.Add(24 * time.Hour),
		Metadata:           json.RawMessage(`{"foo":"bar"}`),
	}
	if err := db.Create(&sub).Error; err != nil {
		t.Fatal(err)
	}

	p := &StripeProvider{}
	sess := &stripe.CheckoutSession{
		Metadata: map[string]string{
			"subscription_id":         sub.ID,
			"checkout_billing_period": "annual",
			"company_id":              sub.CompanyID,
		},
		Subscription: &stripe.Subscription{ID: "sub_stripe_1"},
	}
	if err := p.handleCheckoutCompleted(context.Background(), sess); err != nil {
		t.Fatal(err)
	}

	var got models.Subscription
	if err := db.First(&got, "id = ?", sub.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.Status != "active" {
		t.Fatalf("status: got %q", got.Status)
	}
	if got.StripeSubscriptionID == nil || *got.StripeSubscriptionID != "sub_stripe_1" {
		t.Fatalf("stripe_subscription_id: got %#v", got.StripeSubscriptionID)
	}
	var meta map[string]interface{}
	if err := json.Unmarshal(got.Metadata, &meta); err != nil {
		t.Fatal(err)
	}
	if meta["foo"] != "bar" {
		t.Fatalf("metadata.foo: got %#v", meta["foo"])
	}
	if meta["preferredBillingPeriod"] != "annual" {
		t.Fatalf("preferredBillingPeriod: got %#v", meta["preferredBillingPeriod"])
	}
}
