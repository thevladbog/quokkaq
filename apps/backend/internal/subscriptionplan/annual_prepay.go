package subscriptionplan

import (
	"errors"
	"fmt"

	"quokkaq-go-backend/internal/models"
)

var (
	ErrAnnualPrepayBothFields    = errors.New("annual prepay: set only one of annualPrepayDiscountPercent or annualPrepayPricePerMonth")
	ErrAnnualPrepayInterval      = errors.New("annual prepay options require interval month")
	ErrAnnualPrepayFreeOrZero    = errors.New("annual prepay options require a non-free plan with positive price")
	ErrAnnualPrepayDiscount      = errors.New("annualPrepayDiscountPercent must be between 1 and 100")
	ErrAnnualPrepayPricePerMo    = errors.New("annualPrepayPricePerMonth must be positive")
	ErrAnnualPrepayNotConfigured = errors.New("plan does not support annual prepay checkout")
)

// HasAnnualPrepayConfig reports whether the plan advertises a 12-month prepay option (monthly catalog only).
func HasAnnualPrepayConfig(p *models.SubscriptionPlan) bool {
	if p == nil {
		return false
	}
	if p.IsFree || p.Interval != "month" || p.Price <= 0 {
		return false
	}
	d := p.AnnualPrepayDiscountPercent
	m := p.AnnualPrepayPricePerMonth
	if d != nil && m != nil {
		return false
	}
	if d != nil {
		return *d >= 1 && *d <= 100
	}
	if m != nil {
		return *m > 0
	}
	return false
}

// AnnualPrepayYearlyUnitAmountMinor returns the Stripe subscription unit amount for one yearly billing period (minor units).
func AnnualPrepayYearlyUnitAmountMinor(p *models.SubscriptionPlan) (int64, error) {
	if !HasAnnualPrepayConfig(p) {
		return 0, ErrAnnualPrepayNotConfigured
	}
	if p.AnnualPrepayPricePerMonth != nil {
		v := *p.AnnualPrepayPricePerMonth
		if v <= 0 {
			return 0, ErrAnnualPrepayPricePerMo
		}
		return v * 12, nil
	}
	pct := *p.AnnualPrepayDiscountPercent
	if pct < 1 || pct > 100 {
		return 0, ErrAnnualPrepayDiscount
	}
	// Integer math: 12 months at list price, then apply discount.
	return p.Price * 12 * int64(100-pct) / 100, nil
}

// ValidateAnnualPrepayFields checks mutual exclusion and consistency with interval / price / isFree.
func ValidateAnnualPrepayFields(interval string, isFree bool, price int64, disc *int, ppm *int64) error {
	hasDisc := disc != nil
	hasPPM := ppm != nil
	if hasDisc && hasPPM {
		return ErrAnnualPrepayBothFields
	}
	if !hasDisc && !hasPPM {
		return nil
	}
	if interval != "month" {
		return ErrAnnualPrepayInterval
	}
	if isFree || price <= 0 {
		return ErrAnnualPrepayFreeOrZero
	}
	if hasDisc {
		if *disc < 1 || *disc > 100 {
			return ErrAnnualPrepayDiscount
		}
	}
	if hasPPM && *ppm <= 0 {
		return ErrAnnualPrepayPricePerMo
	}
	return nil
}

// CheckoutLineForBilling returns Stripe line fields for checkout, or nil to use the plan as-is.
func CheckoutLineForBilling(p *models.SubscriptionPlan, billingPeriod string) (*CheckoutSubscriptionLine, error) {
	bp := billingPeriod
	if bp == "" || bp == "month" {
		return nil, nil
	}
	if bp != "annual" {
		return nil, fmt.Errorf("unknown billingPeriod: %s", billingPeriod)
	}
	amt, err := AnnualPrepayYearlyUnitAmountMinor(p)
	if err != nil {
		return nil, err
	}
	name := p.Name
	if name == "" {
		name = p.Code
	}
	return &CheckoutSubscriptionLine{
		UnitAmount:  amt,
		Interval:    "year",
		ProductName: name + " (annual)",
	}, nil
}

// CheckoutSubscriptionLine overrides plan price/interval for Stripe checkout.
type CheckoutSubscriptionLine struct {
	UnitAmount  int64
	Interval    string
	ProductName string
}
