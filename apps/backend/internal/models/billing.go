package models

import (
	"time"
)

// Invoice represents a billing invoice for a subscription
type Invoice struct {
	ID                       string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID                string     `gorm:"not null;index" json:"companyId"`
	SubscriptionID           string     `gorm:"not null" json:"subscriptionId"`
	Amount                   int64      `gorm:"not null" json:"amount"`                          // amount in minor units
	Currency                 string     `gorm:"not null;default:'RUB'" json:"currency"`          // "RUB", "USD"
	Status                   string     `gorm:"not null;default:'draft'" json:"status"`          // "draft", "open", "paid", "void", "uncollectible"
	PaymentProvider          string     `gorm:"default:'manual'" json:"paymentProvider"`         // "stripe", "yookassa", "manual"
	PaymentProviderInvoiceID string     `json:"paymentProviderInvoiceId,omitempty"`              // external invoice ID
	PaidAt                   *time.Time `json:"paidAt,omitempty"`                                // when payment was received
	DueDate                  time.Time  `gorm:"not null" json:"dueDate"`                         // payment due date
	CreatedAt                time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt                time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	// Relations
	Company      Company      `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Subscription Subscription `gorm:"foreignKey:SubscriptionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"subscription,omitempty"`
}

// UsageRecord tracks resource usage for quota management and billing
type UsageRecord struct {
	ID           string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID    string    `gorm:"not null;index:idx_usage_company_metric" json:"companyId"`
	MetricType   string    `gorm:"not null;index:idx_usage_company_metric" json:"metricType"` // "tickets_created", "active_users", "units_count", etc.
	Value        int       `gorm:"not null" json:"value"`                                      // metric value
	Timestamp    time.Time `gorm:"not null;index" json:"timestamp"`                            // when the usage occurred
	BillingMonth time.Time `gorm:"not null;index" json:"billingMonth"`                         // month for aggregation (first day of month)
	CreatedAt    time.Time `gorm:"default:now()" json:"createdAt"`

	// Relations
	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}
