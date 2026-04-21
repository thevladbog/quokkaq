package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SubscriptionPlan represents a subscription tier with features and limits
type SubscriptionPlan struct {
	ID       string          `gorm:"primaryKey" json:"id"`
	Name     string          `gorm:"not null" json:"name"` // Primary display name (e.g. Russian on RU marketing)
	NameEn   string          `gorm:"not null;default:''" json:"nameEn"`
	Code     string          `gorm:"unique;not null" json:"code"`                               // unique plan code like "starter", "professional"
	Price    int64           `gorm:"not null" json:"price"`                                     // price in minor units (cents/kopeks)
	Currency string          `gorm:"not null;default:'RUB'" json:"currency"`                    // "RUB", "USD"
	Interval string          `gorm:"not null;default:'month'" json:"interval"`                  // "month", "year"
	Features json.RawMessage `gorm:"type:jsonb" json:"features,omitempty" swaggertype:"object"` // feature flags
	Limits   json.RawMessage `gorm:"type:jsonb" json:"limits,omitempty" swaggertype:"object"`   // quota limits
	IsActive bool            `gorm:"not null;default:true" json:"isActive"`
	IsPublic bool            `gorm:"not null;default:true" json:"isPublic"`
	// IsPromoted marks the single catalog recommended plan (marketing + in-app pricing highlight).
	IsPromoted bool `gorm:"not null;default:false;column:is_promoted" json:"isPromoted"`
	// DisplayOrder is used for public plan lists (lower values first).
	DisplayOrder int `gorm:"not null;default:1000" json:"displayOrder"`
	// LimitsNegotiable maps limit keys to true when the catalog should show “by agreement” instead of a numeric cap.
	LimitsNegotiable json.RawMessage `gorm:"type:jsonb" json:"limitsNegotiable,omitempty" swaggertype:"object"`
	// AllowInstantPurchase when false: plan may still be public, but checkout is disabled until a sales-led flow exists.
	AllowInstantPurchase bool `gorm:"not null;default:true;column:allow_instant_purchase" json:"allowInstantPurchase"`
	// IsFree when true: plan is always free (price=0 by contract); UI shows "Free" instead of "Custom pricing".
	// Distinct from enterprise (also price=0 but not free). Set by platform operator in plan constructor.
	IsFree bool `gorm:"not null;default:false;column:is_free" json:"isFree"`
	// PricingModel determines how the price field is interpreted.
	// Default: "per_unit".
	//   "per_unit" – price per subdivision per billing period; total = price * active_subdivisions
	//   "flat"     – fixed price per billing period (legacy; use only for grandfathered plans)
	// enums: flat,per_unit
	PricingModel string    `gorm:"not null;default:'per_unit';column:pricing_model" json:"pricingModel" enums:"flat,per_unit"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
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
	PendingPlanID        *string         `gorm:"index" json:"pendingPlanId,omitempty"`                                // scheduled plan change (platform)
	PendingEffectiveAt   *time.Time      `json:"pendingEffectiveAt,omitempty"`                                        // UTC; when reached, PlanID moves to pending plan
	StripeSubscriptionID *string         `gorm:"column:stripe_subscription_id" json:"stripeSubscriptionId,omitempty"` // Stripe sub_… after Checkout completes
	Metadata             json.RawMessage `gorm:"type:jsonb" json:"metadata,omitempty" swaggertype:"object"`           // additional data
	CreatedAt            time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt            time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Plan        SubscriptionPlan  `gorm:"foreignKey:PlanID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"plan,omitempty"`
	PendingPlan *SubscriptionPlan `gorm:"foreignKey:PendingPlanID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"pendingPlan,omitempty"`
	Company     Company           `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

// BeforeCreate assigns a UUID when ID is empty (see SubscriptionPlan.BeforeCreate).
func (s *Subscription) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}
