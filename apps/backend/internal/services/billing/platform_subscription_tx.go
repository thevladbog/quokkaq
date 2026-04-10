package billing

import (
	"errors"
	"strings"
	"time"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// companyShouldPointSubscriptionID decides whether companies.subscription_id should reference a newly created subscription.
func companyShouldPointSubscriptionID(tx *gorm.DB, company *models.Company, sub *models.Subscription, now time.Time) bool {
	now = now.UTC()
	if sub.Status == "canceled" {
		return false
	}
	// New subscription must be active at `now` (start <= now < end).
	if now.Before(sub.CurrentPeriodStart) || !now.Before(sub.CurrentPeriodEnd) {
		return false
	}
	sid := ""
	if company.SubscriptionID != nil {
		sid = strings.TrimSpace(*company.SubscriptionID)
	}
	if sid == "" {
		return true
	}
	var existing models.Subscription
	if err := tx.Where("id = ?", sid).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return true
		}
		return false
	}
	if existing.CurrentPeriodEnd.Before(now) {
		return true
	}
	if existing.Status == "canceled" && sub.CurrentPeriodEnd.After(existing.CurrentPeriodEnd) {
		return true
	}
	return false
}

// CreateSubscriptionForCompanyTx creates a subscription for company and optionally updates company.subscription_id (same tx).
// Allows multiple subscriptions per company (e.g. future periods); the company pointer is only updated when appropriate.
func CreateSubscriptionForCompanyTx(tx *gorm.DB, now time.Time, companyID, planID string, status string, start, end time.Time, trialEnd *time.Time) (*models.Subscription, error) {
	start = start.UTC()
	end = end.UTC()
	var trialEndUTC *time.Time
	if trialEnd != nil {
		t := trialEnd.UTC()
		trialEndUTC = &t
	}

	if !end.After(start) {
		return nil, errors.New("subscription currentPeriodEnd must be after currentPeriodStart")
	}
	effectiveEnd := end
	if trialEndUTC != nil && trialEndUTC.Before(end) {
		effectiveEnd = *trialEndUTC
	}
	if !effectiveEnd.After(start) {
		return nil, errors.New("subscription period is invalid: when trialEnd is before currentPeriodEnd, trialEnd must still be after currentPeriodStart")
	}

	var company models.Company
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", companyID).First(&company).Error; err != nil {
		return nil, err
	}

	sub := &models.Subscription{
		CompanyID:            companyID,
		PlanID:               planID,
		Status:               status,
		CurrentPeriodStart:   start,
		CurrentPeriodEnd:     end,
		CancelAtPeriodEnd:    false,
		TrialEnd:             trialEndUTC,
		StripeSubscriptionID: nil,
	}
	if err := tx.Create(sub).Error; err != nil {
		return nil, err
	}
	if companyShouldPointSubscriptionID(tx, &company, sub, now) {
		if err := tx.Model(&models.Company{}).Where("id = ?", companyID).Update("subscription_id", sub.ID).Error; err != nil {
			return nil, err
		}
	}
	return sub, nil
}
