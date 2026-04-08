package models

import (
	"encoding/json"
	"time"
)

type Company struct {
	ID              string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Name            string          `gorm:"not null" json:"name"`
	OwnerUserID     string          `gorm:"index" json:"ownerUserId,omitempty"`                     // owner of the organization
	SubscriptionID  *string         `gorm:"index" json:"subscriptionId,omitempty"`                  // FK to Subscription
	BillingEmail    string          `json:"billingEmail,omitempty"`                                 // billing contact email
	BillingAddress  json.RawMessage `gorm:"type:jsonb" json:"billingAddress,omitempty" swaggertype:"object"` // billing address details
	Settings        json.RawMessage `gorm:"type:jsonb" json:"settings,omitempty" swaggertype:"object"`       // company settings
	OnboardingState json.RawMessage `gorm:"type:jsonb" json:"onboardingState,omitempty" swaggertype:"object"` // onboarding progress
	CreatedAt       time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt       time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Units        []Unit        `gorm:"foreignKey:CompanyID" json:"units,omitempty"`
	Subscription *Subscription `gorm:"foreignKey:SubscriptionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"subscription,omitempty"`
	Invoices     []Invoice     `gorm:"foreignKey:CompanyID" json:"invoices,omitempty"`
	UsageRecords []UsageRecord `gorm:"foreignKey:CompanyID" json:"usageRecords,omitempty"`
}

type Unit struct {
	ID        string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string          `gorm:"not null" json:"companyId"`
	Code      string          `gorm:"unique;not null" json:"code"`
	Name      string          `gorm:"not null" json:"name"`
	Timezone  string          `gorm:"not null" json:"timezone"`
	Config    json.RawMessage `gorm:"type:jsonb" json:"config,omitempty" swaggertype:"object"`
	CreatedAt time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Company          Company           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"-" swaggerignore:"true"`
	Services         []Service         `gorm:"foreignKey:UnitID" json:"services,omitempty"`
	Counters         []Counter         `gorm:"foreignKey:UnitID" json:"counters,omitempty"`
	Tickets          []Ticket          `gorm:"foreignKey:UnitID" json:"tickets,omitempty"`
	PreRegistrations []PreRegistration `gorm:"foreignKey:UnitID" json:"preRegistrations,omitempty"`
	SlotConfig       *SlotConfig       `gorm:"foreignKey:UnitID" json:"slotConfig,omitempty"`
}
