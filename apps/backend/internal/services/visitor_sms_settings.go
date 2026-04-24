package services

import (
	"encoding/json"
	"strings"

	"quokkaq-go-backend/internal/models"
)

// CompanyVisitorSMSSection is the JSON under company.settings.visitorSms (BYOK for tenant orgs).
// Same semantic fields as deployment SaaS settings; per-company, no process env override.
type CompanyVisitorSMSSection struct {
	SmsProvider  string `json:"smsProvider"`
	SmsApiKey    string `json:"smsApiKey"`
	SmsApiSecret string `json:"smsApiSecret"`
	SmsFromName  string `json:"smsFromName"`
	SmsEnabled   bool   `json:"smsEnabled"`
}

// MergeVisitorSMSSectionIntoCompanySettings returns updated company.settings JSONB with visitorSms set.
func MergeVisitorSMSSectionIntoCompanySettings(existing json.RawMessage, s CompanyVisitorSMSSection) (json.RawMessage, error) {
	var root map[string]json.RawMessage
	if len(existing) > 0 && string(existing) != "null" {
		if err := json.Unmarshal(existing, &root); err != nil {
			return nil, err
		}
	} else {
		root = make(map[string]json.RawMessage)
	}
	enc, err := json.Marshal(s)
	if err != nil {
		return nil, err
	}
	root["visitorSms"] = json.RawMessage(enc)
	return json.Marshal(root)
}

// VisitorSMSSectionFromCompany returns the parsed section and whether keys were present.
func VisitorSMSSectionFromCompany(company *models.Company) (out CompanyVisitorSMSSection, ok bool) {
	if company == nil || len(company.Settings) == 0 || string(company.Settings) == "null" {
		return out, false
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(company.Settings, &root); err != nil {
		return out, false
	}
	raw, has := root["visitorSms"]
	if !has {
		return out, false
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, false
	}
	return out, true
}

// ResolveSMSProviderForCompany returns the outbound SMS provider: tenant if configured, else platform deployment.
// smssource is "tenant", "platform", or "log" (when no usable provider).
func ResolveSMSProviderForCompany(company *models.Company, dep *models.DeploymentSaaSSettings) (SMSProvider, string) {
	tenant, has := VisitorSMSSectionFromCompany(company)
	if has && tenantTakesPriority(tenant) {
		return NewSMSProviderFromConfig(tenantToSMSConfig(tenant, dep)), "tenant"
	}
	plat := NewSMSProviderFromSettings(dep)
	if plat.Name() != "log" {
		return plat, "platform"
	}
	return &LogSMSProvider{}, "log"
}

func tenantTakesPriority(s CompanyVisitorSMSSection) bool {
	if !s.SmsEnabled {
		return false
	}
	if strings.TrimSpace(s.SmsProvider) == "" {
		return false
	}
	// smsc and twilio need two secrets; others may use one key
	switch s.SmsProvider {
	case "smsc", "twilio":
		return strings.TrimSpace(s.SmsApiKey) != "" && strings.TrimSpace(s.SmsApiSecret) != ""
	case "smsaero":
		return strings.TrimSpace(s.SmsApiKey) != "" && strings.TrimSpace(s.SmsApiSecret) != ""
	case "smsru":
		return strings.TrimSpace(s.SmsApiKey) != ""
	default:
		return false
	}
}

// tenantToSMSConfig maps stored tenant fields; does not use env (multi-tenant safe).
// For parity with NewSMSProviderFromSettings, if tenant left secret empty, allow deployment env override only
// when the provider matches deployment's provider (optional convenience for hybrid setups).
func tenantToSMSConfig(t CompanyVisitorSMSSection, dep *models.DeploymentSaaSSettings) SMSConfig {
	cfg := SMSConfig{
		Provider:  strings.TrimSpace(t.SmsProvider),
		APIKey:    t.SmsApiKey,
		APISecret: t.SmsApiSecret,
		FromName:  t.SmsFromName,
	}
	// If tenant key empty but same provider as platform, allow env to fill (same as deployment).
	if dep != nil && strings.TrimSpace(cfg.APIKey) == "" && dep.SmsProvider == cfg.Provider {
		applySMSEnvOverrides(&cfg)
	}
	return cfg
}

// IsLogSMSProvider returns true when the provider is the log (noop) implementation.
func IsLogSMSProvider(p SMSProvider) bool {
	return p == nil || p.Name() == "log"
}

// SMSEffectivelyEnabled returns true when a non-log provider is available for the company.
func SMSEffectivelyEnabled(company *models.Company, dep *models.DeploymentSaaSSettings) bool {
	p, src := ResolveSMSProviderForCompany(company, dep)
	if IsLogSMSProvider(p) {
		return false
	}
	_ = src
	return true
}

// MaskedSMSApiKey for GET responses: show last 4 of key when long enough.
func MaskedSMSApiKey(key string) string {
	if len(key) < 4 {
		return ""
	}
	return "****" + key[len(key)-4:]
}
