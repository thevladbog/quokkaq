package services

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"time"

	"gorm.io/gorm"
)

// ApplyPendingPlanIfDue promotes a scheduled plan to current when PendingEffectiveAt has passed (UTC).
// It updates the row and mutates sub in memory (PlanID, clears pending fields; PendingPlan set nil).
func ApplyPendingPlanIfDue(db *gorm.DB, sub *models.Subscription, now time.Time) error {
	if sub == nil || sub.ID == "" {
		return nil
	}
	if sub.PendingPlanID == nil || sub.PendingEffectiveAt == nil {
		return nil
	}
	if now.Before(*sub.PendingEffectiveAt) {
		return nil
	}
	newPlanID := *sub.PendingPlanID
	if err := db.Model(&models.Subscription{}).Where("id = ?", sub.ID).Updates(map[string]interface{}{
		"plan_id":              newPlanID,
		"pending_plan_id":      nil,
		"pending_effective_at": nil,
	}).Error; err != nil {
		return err
	}
	sub.PlanID = newPlanID
	sub.PendingPlanID = nil
	sub.PendingEffectiveAt = nil
	sub.PendingPlan = nil
	return nil
}

// ApplyPendingPlanIfDueBeforeQuota loads the subscription for companyID and promotes a scheduled plan when PendingEffectiveAt has passed (UTC).
// Call this before quota enforcement (e.g. CheckQuota) so limits match the promoted plan. GetLimit stays read-only and does not perform this write.
func ApplyPendingPlanIfDueBeforeQuota(db *gorm.DB, companyID string, now time.Time) error {
	var sub models.Subscription
	err := db.Where("company_id = ?", companyID).First(&sub).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	return ApplyPendingPlanIfDue(db, &sub, now)
}
