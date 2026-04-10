package models

import "time"

// CatalogItem is platform-wide nomenclature for invoice lines (RU billing).
type CatalogItem struct {
	ID                 string            `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Name               string            `gorm:"not null" json:"name"`
	PrintName          string            `gorm:"not null" json:"printName"`
	Unit               string            `gorm:"not null;default:'шт'" json:"unit"`
	Article            string            `gorm:"not null;default:''" json:"article"`
	DefaultPriceMinor  int64             `gorm:"not null" json:"defaultPriceMinor"` // gross (incl. VAT) per unit
	Currency           string            `gorm:"not null;default:'RUB'" json:"currency"`
	VatExempt          bool              `gorm:"not null;default:false" json:"vatExempt"`
	VatRatePercent     float64           `gorm:"not null;default:0" json:"vatRatePercent"` // used when VatExempt is false
	SubscriptionPlanID *string           `gorm:"index" json:"subscriptionPlanId,omitempty"`
	IsActive           bool              `gorm:"not null;default:true" json:"isActive"`
	CreatedAt          time.Time         `gorm:"default:now()" json:"createdAt"`
	UpdatedAt          time.Time         `gorm:"autoUpdateTime" json:"updatedAt"`
	SubscriptionPlan   *SubscriptionPlan `gorm:"foreignKey:SubscriptionPlanID" json:"plan,omitempty"`
}

// CatalogItemCreateRequest is the JSON body for POST /platform/catalog-items.
type CatalogItemCreateRequest struct {
	Name               string   `json:"name" example:"Подписка Pro"`
	PrintName          string   `json:"printName"`
	Unit               string   `json:"unit"`
	Article            string   `json:"article"`
	DefaultPriceMinor  int64    `json:"defaultPriceMinor"`
	Currency           string   `json:"currency"`
	VatExempt          bool     `json:"vatExempt"`
	VatRatePercent     *float64 `json:"vatRatePercent"`
	SubscriptionPlanID *string  `json:"subscriptionPlanId"`
	IsActive           *bool    `json:"isActive"`
}

// CatalogItemPatchRequest is the JSON body for PATCH /platform/catalog-items/{id}.
type CatalogItemPatchRequest struct {
	Name               *string  `json:"name,omitempty"`
	PrintName          *string  `json:"printName,omitempty"`
	Unit               *string  `json:"unit,omitempty"`
	Article            *string  `json:"article,omitempty"`
	DefaultPriceMinor  *int64   `json:"defaultPriceMinor,omitempty"`
	Currency           *string  `json:"currency,omitempty"`
	VatExempt          *bool    `json:"vatExempt,omitempty"`
	VatRatePercent     *float64 `json:"vatRatePercent,omitempty"`
	SubscriptionPlanID *string  `json:"subscriptionPlanId,omitempty"`
	IsActive           *bool    `json:"isActive,omitempty"`
}
