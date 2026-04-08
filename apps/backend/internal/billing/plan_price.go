package billing

import (
	"strings"

	"quokkaq-go-backend/internal/models"
)

// NormalizePlanPriceMinorUnits fixes legacy rows where RUB was stored as whole rubles (e.g. 2900)
// instead of kopeks (290000). Correct kopek values (typically ≥ 10000 for paid tiers) are unchanged.
func NormalizePlanPriceMinorUnits(p *models.SubscriptionPlan) {
	if p == nil || p.Price <= 0 {
		return
	}
	c := strings.ToUpper(strings.TrimSpace(p.Currency))
	if c != "" && c != "RUB" {
		return
	}
	if p.Price < 10000 {
		p.Price *= 100
	}
}
