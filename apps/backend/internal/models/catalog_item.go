package models

import "time"

// CatalogItem is platform-wide nomenclature for invoice lines (RU billing).
type CatalogItem struct {
	ID                   string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	Name                 string     `gorm:"not null" json:"name"`
	PrintName            string     `gorm:"not null" json:"printName"`
	Unit                 string     `gorm:"not null;default:'шт'" json:"unit"`
	Article              string     `gorm:"not null;default:''" json:"article"`
	DefaultPriceMinor    int64      `gorm:"not null" json:"defaultPriceMinor"` // gross (incl. VAT) per unit
	Currency             string     `gorm:"not null;default:'RUB'" json:"currency"`
	VatExempt            bool       `gorm:"not null;default:false" json:"vatExempt"`
	VatRatePercent       float64    `gorm:"not null;default:0" json:"vatRatePercent"` // used when VatExempt is false
	SubscriptionPlanID   *string    `gorm:"index" json:"subscriptionPlanId,omitempty"`
	IsActive           bool       `gorm:"not null;default:true" json:"isActive"`
	CreatedAt            time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt            time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`
	SubscriptionPlan     *SubscriptionPlan `gorm:"foreignKey:SubscriptionPlanID" json:"plan,omitempty"`
}
