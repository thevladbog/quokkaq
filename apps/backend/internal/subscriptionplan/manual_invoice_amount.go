package subscriptionplan

import (
	"encoding/json"
	"errors"
	"fmt"

	"quokkaq-go-backend/internal/models"
)

func checkedLineAmountMinor(a, qty int64) (int64, error) {
	if qty < 1 {
		qty = 1
	}
	if a == 0 || qty == 0 {
		return 0, nil
	}
	if a > 0 && qty > 0 {
		if a > (1<<63-1)/qty {
			return 0, fmt.Errorf("amount overflow")
		}
		return a * qty, nil
	}
	c := a * qty
	if qty != 0 && c/qty != a {
		return 0, fmt.Errorf("amount overflow")
	}
	return c, nil
}

// ManualInvoiceLineAmountMinor returns the total amount in minor units for a single manual Stripe invoice line item,
// aligned with checkout: monthly list price (optionally × subdivision quantity for per_unit) or annual prepay
// when subscription metadata prefers annual and the plan supports it.
//
// subdivisionQty is the number of billable subdivisions for per_unit plans; callers should pass max(1, count).
// For flat pricing, subdivisionQty is ignored (treated as one seat).
//
// Stripe renewals for annual subscriptions remain in Stripe; this amount is for operator-driven / manual invoices only.
func ManualInvoiceLineAmountMinor(plan *models.SubscriptionPlan, subscriptionMetadata json.RawMessage, subdivisionQty int64) (int64, error) {
	if plan == nil {
		return 0, errors.New("subscription plan is nil")
	}
	qty := subdivisionQty
	if qty < 1 {
		qty = 1
	}
	perUnit := plan.PricingModel == "" || plan.PricingModel == "per_unit"

	if !MetadataPrefersAnnual(subscriptionMetadata) {
		if perUnit {
			return checkedLineAmountMinor(plan.Price, qty)
		}
		return plan.Price, nil
	}

	yearly, err := AnnualPrepayYearlyUnitAmountMinor(plan)
	if err != nil {
		return 0, err
	}
	if perUnit {
		return checkedLineAmountMinor(yearly, qty)
	}
	return yearly, nil
}
