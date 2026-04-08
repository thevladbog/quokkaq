package models

import (
	"encoding/json"
	"time"
)

// SubscriptionPlan represents a subscription tier with features and limits
type SubscriptionPlan struct {
	ID        string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string          `gorm:"not null" json:"name"`                                      // "Starter", "Professional", "Enterprise"
	Code      string          `gorm:"unique;not null" json:"code"`                               // unique plan code like "starter", "professional"
	Price     int64           `gorm:"not null" json:"price"`                                     // price in minor units (cents/kopeks)
	Currency  string          `gorm:"not null;default:'RUB'" json:"currency"`                    // "RUB", "USD"
	Interval  string          `gorm:"not null;default:'month'" json:"interval"`                  // "month", "year"
	Features  json.RawMessage `gorm:"type:jsonb" json:"features,omitempty" swaggertype:"object"` // feature flags
	Limits    json.RawMessage `gorm:"type:jsonb" json:"limits,omitempty" swaggertype:"object"`   // quota limits
	IsActive  bool            `gorm:"not null;default:true" json:"isActive"`
	CreatedAt time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`
}

// Subscription represents a company's active subscription
type Subscription struct {
	ID                 string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID          string          `gorm:"not null;index" json:"companyId"`
	PlanID             string          `gorm:"not null" json:"planId"`
	Status             string          `gorm:"not null;default:'trial'" json:"status"` // "trial", "active", "past_due", "canceled", "paused"
	CurrentPeriodStart time.Time       `gorm:"not null" json:"currentPeriodStart"`
	CurrentPeriodEnd   time.Time       `gorm:"not null" json:"currentPeriodEnd"`
	CancelAtPeriodEnd  bool            `gorm:"not null;default:false" json:"cancelAtPeriodEnd"`
	TrialEnd           *time.Time      `json:"trialEnd,omitempty"`
	Metadata           json.RawMessage `gorm:"type:jsonb" json:"metadata,omitempty" swaggertype:"object"` // additional data
	CreatedAt          time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt          time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Plan    SubscriptionPlan `gorm:"foreignKey:PlanID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"plan,omitempty"`
	Company Company          `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
