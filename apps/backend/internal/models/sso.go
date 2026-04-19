package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CompanySSOConnection holds OIDC or SAML configuration for a tenant (one row per company in v1).
type CompanySSOConnection struct {
	ID        string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string `gorm:"not null;uniqueIndex" json:"companyId"`
	Enabled   bool   `gorm:"not null;default:false" json:"enabled"`
	// SSOProtocol is "oidc" (default) or "saml".
	SSOProtocol string `gorm:"size:16;not null;default:oidc" json:"ssoProtocol"`
	// SAMLIDPMetadataURL is the IdP metadata URL when using SAML (HTTPS GET).
	SAMLIDPMetadataURL    string      `gorm:"type:text" json:"samlIdpMetadataUrl,omitempty"`
	IssuerURL             string      `gorm:"not null" json:"issuerUrl"` // OIDC issuer / discovery base
	ClientID              string      `gorm:"not null" json:"clientId"`
	ClientSecretEncrypted string      `gorm:"type:text;not null" json:"-"` // AES-GCM blob, base64
	EmailDomains          StringArray `gorm:"type:text[]" json:"emailDomains,omitempty"`
	Scopes                string      `gorm:"not null;default:'openid email profile'" json:"scopes"`
	CreatedAt             time.Time   `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt             time.Time   `gorm:"autoUpdateTime" json:"updatedAt"`

	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (c *CompanySSOConnection) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return nil
}

// UserExternalIdentity links a QuokkaQ user to an OIDC subject for a given issuer.
type UserExternalIdentity struct {
	ID        string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    string `gorm:"not null;index" json:"userId"`
	CompanyID string `gorm:"not null;index" json:"companyId"`
	Issuer    string `gorm:"not null;uniqueIndex:ux_user_ext_issuer_sub,priority:1" json:"issuer"`
	Subject   string `gorm:"not null;uniqueIndex:ux_user_ext_issuer_sub,priority:2" json:"subject"`
	// ExternalObjectID is an optional stable directory id (e.g. Entra oid) for matching across subject changes.
	ExternalObjectID *string   `gorm:"column:external_object_id;size:512;index" json:"externalObjectId,omitempty"`
	CreatedAt        time.Time `gorm:"autoCreateTime" json:"createdAt"`

	User    User    `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (u *UserExternalIdentity) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}

// TenantLoginLink is an opaque login token for strict-tenant mode (hashed at rest).
type TenantLoginLink struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID string    `gorm:"not null;index" json:"companyId"`
	TokenHash string    `gorm:"not null;uniqueIndex;size:64" json:"-"` // sha256 hex
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	Revoked   bool      `gorm:"not null;default:false" json:"revoked"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`

	Company Company `gorm:"foreignKey:CompanyID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-" swaggerignore:"true"`
}

func (t *TenantLoginLink) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return nil
}

// SSOAuditEvent is a minimal append-only record for SSO operations (no PII in detail).
type SSOAuditEvent struct {
	ID        string    `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	CompanyID *string   `gorm:"index" json:"companyId,omitempty"`
	UserID    *string   `gorm:"index" json:"userId,omitempty"`
	Success   bool      `gorm:"not null" json:"success"`
	Detail    string    `gorm:"size:512;not null" json:"detail"`
	CreatedAt time.Time `gorm:"autoCreateTime;index" json:"createdAt"`
}

func (e *SSOAuditEvent) BeforeCreate(tx *gorm.DB) error {
	if e.ID == "" {
		e.ID = uuid.New().String()
	}
	return nil
}
