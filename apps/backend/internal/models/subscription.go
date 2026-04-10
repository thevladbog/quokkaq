package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SubscriptionPlan represents a subscription tier with features and limits
type SubscriptionPlan struct {
	ID        string          `gorm:"primaryKey" json:"id"`
	Name      string          `gorm:"not null" json:"name"`                                      // "Starter", "Professional", "Enterprise"
	Code      string          `gorm:"unique;not null" json:"code"`                               // unique plan code like "starter", "professional"
	Price     int64           `gorm:"not null" json:"price"`                                     // price in minor units (cents/kopeks)
	Currency  string          `gorm:"not null;default:'RUB'" json:"currency"`                    // "RUB", "USD"
	Interval  string          `gorm:"not null;default:'month'" json:"interval"`                  // "month", "year"
	Features  json.RawMessage `gorm:"type:jsonb" json:"features,omitempty" swaggertype:"object"` // feature flags
	Limits    json.RawMessage `gorm:"type:jsonb" json:"limits,omitempty" swaggertype:"object"`   // quota limits
	IsActive  bool            `gorm:"not null;default:true" json:"isActive"`
	CreatedAt time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`
}

// BeforeCreate assigns a UUID when ID is empty so inserts work without a DB default (Postgres gen_random_uuid is not portable to SQLite tests).
func (p *SubscriptionPlan) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return nil
}

// Subscription represents a company's active subscription
type Subscription struct {
	ID                   string          `gorm:"primaryKey" json:"id"`
	CompanyID            string          `gorm:"not null;index" json:"companyId"`
	PlanID               string          `gorm:"not null" json:"planId"`
	Status               string          `gorm:"not null;default:'trial'" json:"status"` // "trial", "active", "past_due", "canceled", "paused"
	CurrentPeriodStart   time.Time       `gorm:"not null" json:"currentPeriodStart"`
	CurrentPeriodEnd     time.Time       `gorm:"not null" json:"currentPeriodEnd"`
	CancelAtPeriodEnd    bool            `gorm:"not null;default:false" json:"cancelAtPeriodEnd"`
	TrialEnd             *time.Time      `json:"trialEnd,omitempty"`
	PendingPlanID        *string         `gorm:"index" json:"pendingPlanId,omitempty"` // scheduled plan change (platform)
	PendingEffectiveAt   *time.Time      `json:"pendingEffectiveAt,omitempty"`        // UTC; when reached, PlanID moves to pending plan
	StripeSubscriptionID *string         `gorm:"column:stripe_subscription_id" json:"stripeSubscriptionId,omitempty"` // Stripe sub_… after Checkout completes
	Metadata             json.RawMessage `gorm:"type:jsonb" json:"metadata,omitempty" swaggertype:"object"`           // additional data
	CreatedAt            time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt            time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Plan        SubscriptionPlan `gorm:"foreignKey:PlanID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"plan,omitempty"`
	PendingPlan *SubscriptionPlan `gorm:"foreignKey:PendingPlanID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"pendingPlan,omitempty"`
	Company     Company          `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

// BeforeCreate assigns a UUID when ID is empty (see SubscriptionPlan.BeforeCreate).
func (s *Subscription) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}
