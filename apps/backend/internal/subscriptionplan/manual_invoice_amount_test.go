package subscriptionplan

import (
	"encoding/json"
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestManualInvoiceLineAmountMinor_monthPerUnit(t *testing.T) {
	p := &models.SubscriptionPlan{
		Interval:     "month",
		Price:        500,
		PricingModel: "per_unit",
		Currency:     "RUB",
	}
	got, err := ManualInvoiceLineAmountMinor(p, nil, 3)
	if err != nil {
		t.Fatal(err)
	}
	if got != 1500 {
		t.Fatalf("got %d want 1500", got)
	}
}

func TestManualInvoiceLineAmountMinor_annualPerUnit(t *testing.T) {
	d := 10
	p := &models.SubscriptionPlan{
		Interval:                    "month",
		Price:                       1000,
		PricingModel:                "per_unit",
		Currency:                    "RUB",
		AnnualPrepayDiscountPercent: &d,
	}
	meta := json.RawMessage(`{"preferredBillingPeriod":"annual"}`)
	// yearly unit: 1000*12*90/100 = 10800; ×2 subdivisions
	got, err := ManualInvoiceLineAmountMinor(p, meta, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got != 21600 {
		t.Fatalf("got %d want 21600", got)
	}
}

func TestManualInvoiceLineAmountMinor_annualFlat(t *testing.T) {
	d := 20
	p := &models.SubscriptionPlan{
		Interval:                    "month",
		Price:                       1000,
		PricingModel:                "flat",
		Currency:                    "RUB",
		AnnualPrepayDiscountPercent: &d,
	}
	meta := json.RawMessage(`{"preferredBillingPeriod":"annual"}`)
	got, err := ManualInvoiceLineAmountMinor(p, meta, 99)
	if err != nil {
		t.Fatal(err)
	}
	// flat ignores qty: 1000 * 12 * 80 / 100 = 9600
	if got != 9600 {
		t.Fatalf("got %d want 9600", got)
	}
}
