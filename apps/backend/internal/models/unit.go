package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Unit kinds: subdivision = branch / operational unit (queue, kiosk, counters attach here);
// service_zone = optional grouping inside a subdivision (or nested).
const (
	UnitKindSubdivision = "subdivision"
	UnitKindServiceZone = "service_zone"
)

// UnitKindAllowsChildUnits is true when this unit may have child units in the org tree.
func UnitKindAllowsChildUnits(k string) bool {
	return k == UnitKindServiceZone || k == UnitKindSubdivision
}

type Company struct {
	ID              string          `gorm:"primaryKey" json:"id"`
	Name            string          `gorm:"not null" json:"name"`
	OwnerUserID     string          `gorm:"index" json:"ownerUserId,omitempty"`                                     // owner of the organization
	SubscriptionID  *string         `gorm:"index" json:"subscriptionId,omitempty"`                                  // FK to Subscription
	IsSaaSOperator  bool            `gorm:"column:is_saas_operator;not null;default:false" json:"isSaasOperator"`   // single operator tenant per deployment; quotas bypassed
	BillingEmail    string          `json:"billingEmail,omitempty"`                                                 // billing contact email
	BillingAddress  json.RawMessage `gorm:"type:jsonb" json:"billingAddress,omitempty" swaggertype:"object"`        // billing address details
	PaymentAccounts json.RawMessage `gorm:"type:jsonb" json:"paymentAccounts,omitempty" swaggertype:"array,object"` // RU bank accounts (JSON array)
	Counterparty    json.RawMessage `gorm:"type:jsonb" json:"counterparty,omitempty" swaggertype:"object"`          // legal profile (RU): partyType, inn, addresses, etc.
	Settings        json.RawMessage `gorm:"type:jsonb" json:"settings,omitempty" swaggertype:"object"`              // company settings
	OnboardingState json.RawMessage `gorm:"type:jsonb" json:"onboardingState,omitempty" swaggertype:"object"`       // onboarding progress
	CreatedAt       time.Time       `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt       time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Units        []Unit        `gorm:"foreignKey:CompanyID" json:"units,omitempty"`
	Subscription *Subscription `gorm:"foreignKey:SubscriptionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"subscription,omitempty"`
	Invoices     []Invoice     `gorm:"foreignKey:CompanyID" json:"invoices,omitempty"`
	UsageRecords []UsageRecord `gorm:"foreignKey:CompanyID" json:"usageRecords,omitempty"`
}

// BeforeCreate assigns a UUID when ID is empty (see SubscriptionPlan.BeforeCreate).
func (c *Company) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

// CompanyPatch is the JSON body for PATCH /companies/me. All fields are optional; omit keys to leave values unchanged.
// Use clearBillingAddress / clearCounterparty to null out JSONB columns without sending a replacement object.
type CompanyPatch struct {
	Name                *string          `json:"name,omitempty"`
	BillingEmail        *string          `json:"billingEmail,omitempty"`
	Counterparty        *json.RawMessage `json:"counterparty,omitempty" swaggertype:"object"`
	ClearCounterparty   *bool            `json:"clearCounterparty,omitempty"`
	BillingAddress      *json.RawMessage `json:"billingAddress,omitempty" swaggertype:"object"`
	ClearBillingAddress *bool            `json:"clearBillingAddress,omitempty"`
	PaymentAccounts     *json.RawMessage `json:"paymentAccounts,omitempty" swaggertype:"array,object"` // items: @quokkaq/shared-types PaymentAccountSchema
}

type Unit struct {
	ID        string          `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string          `gorm:"not null" json:"companyId"`
	ParentID  *string         `gorm:"index" json:"parentId,omitempty"`
	Code      string          `gorm:"not null" json:"code"`
	Kind      string          `gorm:"not null;default:subdivision" json:"kind"`
	SortOrder int             `gorm:"not null;default:0" json:"sortOrder"`
	Name      string          `gorm:"not null" json:"name"`
	Timezone  string          `gorm:"not null" json:"timezone"`
	Config    json.RawMessage `gorm:"type:jsonb" json:"config,omitempty" swaggertype:"object"`
	CreatedAt time.Time       `gorm:"default:now()" json:"createdAt"`
	UpdatedAt time.Time       `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Company          Company           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"-" swaggerignore:"true"`
	Parent           *Unit             `gorm:"foreignKey:ParentID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"parent,omitempty" swaggerignore:"true"`
	Children         []Unit            `gorm:"foreignKey:ParentID" json:"children,omitempty"`
	Services         []Service         `gorm:"foreignKey:UnitID" json:"services,omitempty"`
	Counters         []Counter         `gorm:"foreignKey:UnitID" json:"counters,omitempty"`
	Tickets          []Ticket          `gorm:"foreignKey:UnitID" json:"tickets,omitempty"`
	PreRegistrations []PreRegistration `gorm:"foreignKey:UnitID" json:"preRegistrations,omitempty"`
	SlotConfig       *SlotConfig       `gorm:"foreignKey:UnitID" json:"slotConfig,omitempty"`
}
