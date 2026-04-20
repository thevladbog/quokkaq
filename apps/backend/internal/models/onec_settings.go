package models

import (
	"encoding/json"
	"time"
)

// CompanyOneCSettings holds per-tenant 1C УНФ CommerceML exchange credentials (HTTP checkauth).
// Password is stored bcrypt-hashed; never returned to clients.
type CompanyOneCSettings struct {
	CompanyID          string          `gorm:"column:company_id;primaryKey" json:"companyId"`
	ExchangeEnabled    bool            `gorm:"column:exchange_enabled;not null;default:false" json:"exchangeEnabled"`
	HTTPLogin          string          `gorm:"column:http_login;not null;default:''" json:"httpLogin"`
	HTTPPasswordBcrypt string          `gorm:"column:http_password_bcrypt;not null;default:''" json:"-"`
	CommerceMLVersion  string          `gorm:"column:commerce_ml_version;not null;default:2.10" json:"commerceMlVersion"`
	StatusMappingJSON  json.RawMessage `gorm:"column:status_mapping_json;type:jsonb" json:"statusMapping,omitempty"`
	// SitePaymentSystemName matches the «payment system on site» name in UNF wizard (for эквайринг mapping to a terminal).
	SitePaymentSystemName string    `gorm:"column:site_payment_system_name;not null;default:''" json:"sitePaymentSystemName,omitempty"`
	CreatedAt             time.Time `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt             time.Time `gorm:"column:updated_at" json:"updatedAt"`
}

func (CompanyOneCSettings) TableName() string {
	return "company_onec_settings"
}

// OneCStatusMappingRuleDTO describes one UNF order status → invoice status rule (CommerceML import).
type OneCStatusMappingRuleDTO struct {
	Contains      string `json:"contains,omitempty"`
	Equals        string `json:"equals,omitempty"`
	InvoiceStatus string `json:"invoiceStatus"` // paid | void | uncollectible
}

// OneCStatusMappingDTO is persisted in company_onec_settings.status_mapping_json and returned from GET.
type OneCStatusMappingDTO struct {
	Rules []OneCStatusMappingRuleDTO `json:"rules"`
}

// CompanyOneCSettingsPublic is returned from GET /companies/me/onec-settings (no secrets).
type CompanyOneCSettingsPublic struct {
	CompanyID             string                `json:"companyId"`
	ExchangeEnabled       bool                  `json:"exchangeEnabled"`
	HTTPLogin             string                `json:"httpLogin"`
	PasswordSet           bool                  `json:"passwordSet"`
	CommerceMLVersion     string                `json:"commerceMlVersion"`
	StatusMapping         *OneCStatusMappingDTO `json:"statusMapping,omitempty"`
	SitePaymentSystemName string                `json:"sitePaymentSystemName,omitempty"`
	ExchangeURLHint       string                `json:"exchangeUrlHint,omitempty"` // filled by handler from PUBLIC_APP_URL
}

// CompanyOneCSettingsPutBody is the subset of fields decoded from PUT /companies/me/onec-settings.
// Optional statusMapping is parsed separately so null vs omitted can be detected (see handler).
type CompanyOneCSettingsPutBody struct {
	ExchangeEnabled       *bool   `json:"exchangeEnabled"`
	HTTPLogin             *string `json:"httpLogin"`
	HTTPPassword          *string `json:"httpPassword"` // empty string clears password; omit to leave unchanged
	CommerceMLVersion     *string `json:"commerceMlVersion"`
	SitePaymentSystemName *string `json:"sitePaymentSystemName"`
}

// CompanyOneCSettingsPutRequest documents the full PUT body including optional statusMapping (OpenAPI / swag).
type CompanyOneCSettingsPutRequest struct {
	CompanyOneCSettingsPutBody
	StatusMapping *OneCStatusMappingDTO `json:"statusMapping,omitempty"`
}
