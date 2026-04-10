package models

import "time"

// InvoiceLine is one position on a multi-line invoice (snapshot from catalog + edits).
type InvoiceLine struct {
	ID                       string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	InvoiceID                string     `gorm:"not null;index" json:"invoiceId"`
	Position                 int        `gorm:"not null" json:"position"`
	CatalogItemID            *string    `gorm:"index" json:"catalogItemId,omitempty"`
	DescriptionPrint         string     `gorm:"not null" json:"descriptionPrint"`
	Quantity                 float64    `gorm:"not null" json:"quantity"`
	// Print UOM (DB column unit). Renamed from "Unit" to avoid GORM confusion with models.Unit in this package.
	MeasureUnit              string     `gorm:"column:unit;not null;default:''" json:"unit"`
	UnitPriceInclVatMinor    int64      `gorm:"not null" json:"unitPriceInclVatMinor"`
	DiscountPercent          *float64   `json:"discountPercent,omitempty"`
	DiscountAmountMinor      *int64     `json:"discountAmountMinor,omitempty"`
	VatExempt                bool       `gorm:"not null" json:"vatExempt"`
	VatRatePercent           float64    `gorm:"not null;default:0" json:"vatRatePercent"`
	LineNetMinor             int64      `gorm:"not null" json:"lineNetMinor"`
	VatAmountMinor           int64      `gorm:"not null" json:"vatAmountMinor"`
	LineGrossMinor           int64      `gorm:"not null" json:"lineGrossMinor"`
	SubscriptionPlanID       *string    `gorm:"index" json:"subscriptionPlanId,omitempty"`
	SubscriptionPeriodStart  *time.Time `json:"subscriptionPeriodStart,omitempty"`
	SubscriptionPeriodEnd    *time.Time `json:"subscriptionPeriodEnd,omitempty"`
	CreatedAt                time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt                time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	Invoice          Invoice            `gorm:"foreignKey:InvoiceID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	SubscriptionPlan *SubscriptionPlan  `gorm:"foreignKey:SubscriptionPlanID" json:"plan,omitempty"`
}
