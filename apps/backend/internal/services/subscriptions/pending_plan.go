package subscriptions

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"time"

	"gorm.io/gorm"
)

// ApplyPendingPlanIfDue promotes a scheduled plan to current when PendingEffectiveAt has passed (UTC).
// It updates the row and mutates sub in memory (PlanID, clears pending fields; PendingPlan set nil).
// The returned bool is true when the subscription row was updated in the database.
func ApplyPendingPlanIfDue(db *gorm.DB, sub *models.Subscription, now time.Time) (bool, error) {
	if sub == nil || sub.ID == "" {
		return false, nil
	}
	if sub.PendingPlanID == nil || sub.PendingEffectiveAt == nil {
		return false, nil
	}
	if now.Before(*sub.PendingEffectiveAt) {
		return false, nil
	}
	newPlanID := *sub.PendingPlanID
	pendingAt := *sub.PendingEffectiveAt
	res := db.Model(&models.Subscription{}).
		Where("id = ?", sub.ID).
		Where("pending_plan_id = ?", newPlanID).
		Where("pending_effective_at = ?", pendingAt).
		Updates(map[string]interface{}{
			"plan_id":              newPlanID,
			"pending_plan_id":      nil,
			"pending_effective_at": nil,
		})
	if res.Error != nil {
		return false, res.Error
	}
	if res.RowsAffected == 0 {
		return false, nil
	}
	sub.PlanID = newPlanID
	sub.PendingPlanID = nil
	sub.PendingEffectiveAt = nil
	sub.PendingPlan = nil
	return true, nil
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
	_, err = ApplyPendingPlanIfDue(db, &sub, now)
	return err
}
