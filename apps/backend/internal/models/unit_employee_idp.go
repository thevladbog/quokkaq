package models

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UnitEmployeeIdpSetting stores HTTPS upstream config for employee badge/login resolution (one row per unit).
type UnitEmployeeIdpSetting struct {
	ID         string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID     string `gorm:"not null;uniqueIndex:ux_unit_employee_idp_settings_unit;column:unit_id" json:"unitId"`
	Enabled    bool   `gorm:"not null;default:false" json:"enabled"`
	HTTPMethod string `gorm:"not null;default:'POST';size:8;column:http_method" json:"httpMethod"`
	// UpstreamURL must be https (enforced in service; SSRF-protected).
	UpstreamURL string `gorm:"not null;column:upstream_url" json:"upstreamUrl"`
	// RequestBodyTemplate is a Go text/template JSON (empty for GET) with .Raw, .Login, .UidHex, .Ts, .Kind
	RequestBodyTemplate string `gorm:"type:text;column:request_body_template" json:"requestBodyTemplate,omitempty"`
	// JSON paths (dot notation) for extracting fields from upstream JSON response, e.g. "data.email"
	ResponseEmailPath       string `gorm:"type:text;column:response_email_path" json:"responseEmailPath"`
	ResponseDisplayNamePath string `gorm:"type:text;column:response_display_name_path" json:"responseDisplayNamePath,omitempty"`
	// HeaderTemplates is JSON: [{"name":"X-Api-Key","value":"${secret:apiKey}"},...]
	HeaderTemplatesJSON string `gorm:"type:jsonb;not null;default:'[]';column:header_templates_json" json:"headerTemplatesJson"`
	TimeoutMS           int    `gorm:"not null;default:10000;column:timeout_ms" json:"timeoutMs"`
}

func (UnitEmployeeIdpSetting) TableName() string { return "unit_employee_idp_settings" }

func (u *UnitEmployeeIdpSetting) BeforeCreate(tx *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return nil
}

// UnitEmployeeIdpSecret is a named secret for a unit (referenced from header/body templates).
type UnitEmployeeIdpSecret struct {
	ID         string `gorm:"primaryKey;default:gen_random_uuid()" json:"id"`
	UnitID     string `gorm:"not null;uniqueIndex:ux_unit_employee_idp_secrets_unit_name;column:unit_id" json:"unitId"`
	Name       string `gorm:"not null;size:64" json:"name"`
	Ciphertext string `gorm:"type:text;not null" json:"-"`
}

func (UnitEmployeeIdpSecret) TableName() string { return "unit_employee_idp_secrets" }

func (s *UnitEmployeeIdpSecret) BeforeCreate(tx *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return nil
}
