package services

import (
	"quokkaq-go-backend/internal/models"
	"time"

	"gorm.io/gorm"
)

// ApplyPendingPlanIfDue promotes a scheduled plan to current when PendingEffectiveAt has passed (UTC).
// It updates the row and mutates sub in memory (PlanID, clears pending fields; PendingPlan zeroed).
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
	sub.PendingPlan = models.SubscriptionPlan{}
	return nil
}
