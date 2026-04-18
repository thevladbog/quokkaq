package subscriptions

import (
	"encoding/json"
	"testing"
	"time"

	"quokkaq-go-backend/internal/models"

	glebarezsqlite "github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestApplyPendingPlanIfDue_NotYetEffective_NoDBChange(t *testing.T) {
	db := newPendingPlanTestDB(t)
	planA, planB, sub := seedSubscriptionWithPending(t, db, time.Now().UTC().Add(24*time.Hour))

	promoted, err := ApplyPendingPlanIfDue(db, sub, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if promoted {
		t.Fatal("expected no promotion when effective date is in the future")
	}

	var got models.Subscription
	if err := db.First(&got, "id = ?", sub.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.PlanID != planA.ID {
		t.Fatalf("plan_id: want %q, got %q", planA.ID, got.PlanID)
	}
	if got.PendingPlanID == nil || *got.PendingPlanID != planB.ID {
		t.Fatalf("pending_plan_id: want %q, got %v", planB.ID, got.PendingPlanID)
	}
	if got.PendingEffectiveAt == nil {
		t.Fatal("expected pending_effective_at to remain set")
	}
}

func TestApplyPendingPlanIfDue_PastEffective_PromotesPlanAndClearsPending(t *testing.T) {
	db := newPendingPlanTestDB(t)
	_, planB, sub := seedSubscriptionWithPending(t, db, time.Now().UTC().Add(-time.Hour))

	promoted, err := ApplyPendingPlanIfDue(db, sub, time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	if !promoted {
		t.Fatal("expected promotion when effective date is in the past")
	}

	var got models.Subscription
	if err := db.First(&got, "id = ?", sub.ID).Error; err != nil {
		t.Fatal(err)
	}
	if got.PlanID != planB.ID {
		t.Fatalf("plan_id: want %q (pending), got %q", planB.ID, got.PlanID)
	}
	if got.PendingPlanID != nil {
		t.Fatalf("pending_plan_id: want nil, got %v", got.PendingPlanID)
	}
	if got.PendingEffectiveAt != nil {
		t.Fatalf("pending_effective_at: want nil, got %v", got.PendingEffectiveAt)
	}
	if sub.PlanID != planB.ID {
		t.Fatalf("in-memory PlanID: want %q, got %q", planB.ID, sub.PlanID)
	}
	if sub.PendingPlanID != nil {
		t.Fatal("in-memory pending should be cleared")
	}
	if sub.PendingPlan != nil {
		t.Fatal("in-memory PendingPlan should be nil after promotion")
	}
}

func newPendingPlanTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(glebarezsqlite.Open(":memory:"), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	// Schema from the same GORM models as production (no hand-written CREATE TABLE).
	if err := db.AutoMigrate(
		&models.SubscriptionPlan{},
		&models.Company{},
		&models.Subscription{},
	); err != nil {
		t.Fatal(err)
	}
	return db
}

func seedSubscriptionWithPending(t *testing.T, db *gorm.DB, effectiveAt time.Time) (planA, planB models.SubscriptionPlan, sub *models.Subscription) {
	t.Helper()
	planA = models.SubscriptionPlan{
		ID: "plan-a", Name: "Plan A", Code: "a", Price: 100, Currency: "RUB", Interval: "month",
		IsActive: true, IsPublic: true, DisplayOrder: 1,
		LimitsNegotiable: json.RawMessage("{}"), AllowInstantPurchase: true,
	}
	planB = models.SubscriptionPlan{
		ID: "plan-b", Name: "Plan B", Code: "b", Price: 200, Currency: "RUB", Interval: "month",
		IsActive: true, IsPublic: true, DisplayOrder: 2,
		LimitsNegotiable: json.RawMessage("{}"), AllowInstantPurchase: true,
	}
	if err := db.Create(&planA).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&planB).Error; err != nil {
		t.Fatal(err)
	}
	company := models.Company{ID: "co-1", Name: "Test Co"}
	if err := db.Create(&company).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	pendingID := planB.ID
	sub = &models.Subscription{
		ID:                 "sub-1",
		CompanyID:          company.ID,
		PlanID:             planA.ID,
		Status:             "active",
		CurrentPeriodStart: now.Add(-48 * time.Hour),
		CurrentPeriodEnd:   now.Add(720 * time.Hour),
		PendingPlanID:      &pendingID,
		PendingEffectiveAt: &effectiveAt,
	}
	if err := db.Create(sub).Error; err != nil {
		t.Fatal(err)
	}
	return planA, planB, sub
}
