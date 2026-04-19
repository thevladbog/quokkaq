package models

import (
	"encoding/json"
	"time"
)

// Invoice represents a billing invoice; subscriptionId may be nil until linked (manual platform flow).
// CompanyID is optional after the company is removed: FK uses ON DELETE SET NULL so historical invoices are retained (retention/archival) instead of cascading away with the company.
type Invoice struct {
	ID                       string     `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID                *string    `gorm:"index" json:"companyId,omitempty"`
	SubscriptionID           *string    `gorm:"index" json:"subscriptionId"`
	Amount                   int64      `gorm:"not null" json:"amount"`                  // total in minor units (gross); equals sum of line gross when lines exist
	Currency                 string     `gorm:"not null;default:'RUB'" json:"currency"`  // "RUB", "USD"
	Status                   string     `gorm:"not null;default:'draft'" json:"status"`  // "draft", "open", "paid", "void", "uncollectible"
	PaymentProvider          string     `gorm:"default:'manual'" json:"paymentProvider"` // "stripe", "yookassa", "manual"
	PaymentProviderInvoiceID string     `json:"paymentProviderInvoiceId,omitempty"`      // external invoice ID
	PaidAt                   *time.Time `json:"paidAt,omitempty"`                        // when payment was received
	DueDate                  time.Time  `gorm:"not null" json:"dueDate"`                 // payment due date
	CreatedAt                time.Time  `gorm:"default:now()" json:"createdAt"`
	UpdatedAt                time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	DocumentNumber                  *string         `gorm:"column:document_number" json:"documentNumber,omitempty"` // QQ-YYYY-NNNNN when issued
	SubtotalExclVatMinor            int64           `gorm:"column:subtotal_excl_vat_minor;not null;default:0" json:"subtotalExclVatMinor"`
	VatTotalMinor                   int64           `gorm:"column:vat_total_minor;not null;default:0" json:"vatTotalMinor"`
	AllowYookassaPaymentLink        bool            `gorm:"not null;default:false" json:"allowYookassaPaymentLink"`
	AllowStripePaymentLink          bool            `gorm:"not null;default:false" json:"allowStripePaymentLink"`
	ProvisionSubscriptionsOnPayment bool            `gorm:"not null;default:false" json:"provisionSubscriptionsOnPayment"`
	YookassaPaymentID               string          `json:"yookassaPaymentId,omitempty"`
	YookassaConfirmationURL         string          `json:"yookassaConfirmationUrl,omitempty"`
	StripeCheckoutURL               string          `json:"stripeCheckoutUrl,omitempty"`
	StripeSessionID                 string          `json:"stripeSessionId,omitempty"`
	ProvisioningDoneAt              *time.Time      `json:"provisioningDoneAt,omitempty"`
	IssuedAt                        *time.Time      `json:"issuedAt,omitempty"`
	BuyerSnapshot                   json.RawMessage `gorm:"type:jsonb" json:"buyerSnapshot,omitempty" swaggertype:"object"`
	Lines                           []InvoiceLine   `gorm:"foreignKey:InvoiceID" json:"lines,omitempty"`

	// Relations — OnDelete:SET NULL on subscription keeps paid/open manual history if subscription row is removed.
	Company      Company       `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"-" swaggerignore:"true"`
	Subscription *Subscription `gorm:"foreignKey:SubscriptionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"subscription,omitempty"`
}

// UsageRecord tracks resource usage for quota management and billing.
// Rows are kept for metering, audit, and alignment with invoice retention; deleting a company must not cascade-delete usage (RESTRICT), so archival/offboarding flows handle or reassign data explicitly.
type UsageRecord struct {
	ID           string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID    string    `gorm:"not null;index:idx_usage_company_metric" json:"companyId"`
	MetricType   string    `gorm:"not null;index:idx_usage_company_metric" json:"metricType"` // e.g. tickets_per_month (monthly ticket quota), matches plan limit keys
	Value        int       `gorm:"not null" json:"value"`                                     // metric value
	Timestamp    time.Time `gorm:"not null;index" json:"timestamp"`                           // when the usage occurred
	BillingMonth time.Time `gorm:"not null;index" json:"billingMonth"`                        // month for aggregation (first day of month)
	CreatedAt    time.Time `gorm:"default:now()" json:"createdAt"`

	// Relations — OnDelete:RESTRICT prevents purging usage when a company is removed (invoices use SET NULL for retention); matches retention over silent cascade.
	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"-" swaggerignore:"true"`
}
