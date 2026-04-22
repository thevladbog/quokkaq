package subscriptionplan

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

func TestAnnualPrepayYearlyUnitAmount_Discount(t *testing.T) {
	d := 20
	p := &models.SubscriptionPlan{
		Interval:                    "month",
		Price:                       1000,
		IsFree:                      false,
		AnnualPrepayDiscountPercent: &d,
	}
	got, err := AnnualPrepayYearlyUnitAmountMinor(p)
	if err != nil {
		t.Fatal(err)
	}
	// 1000 * 12 * 80 / 100 = 9600
	if got != 9600 {
		t.Fatalf("got %d want 9600", got)
	}
}

func TestAnnualPrepayYearlyUnitAmount_FixedPerMonth(t *testing.T) {
	m := int64(800)
	p := &models.SubscriptionPlan{
		Interval:                  "month",
		Price:                     1000,
		IsFree:                    false,
		AnnualPrepayPricePerMonth: &m,
	}
	got, err := AnnualPrepayYearlyUnitAmountMinor(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != 800*12 {
		t.Fatalf("got %d want %d", got, 800*12)
	}
}

func TestValidateAnnualPrepayFields_BothSet(t *testing.T) {
	d := 10
	var m int64 = 9
	err := ValidateAnnualPrepayFields("month", false, 100, &d, &m)
	if err != ErrAnnualPrepayBothFields {
		t.Fatalf("got %v", err)
	}
}
