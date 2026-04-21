package services

import (
	"quokkaq-go-backend/internal/models"
)

// SMSProvider is the interface for outbound SMS delivery.
type SMSProvider interface {
	// Send sends a single SMS message to the given E.164 phone number.
	Send(to, body string) error
	// Name returns the provider identifier (e.g. "smsc", "smsru").
	Name() string
}

// SMSConfig holds resolved SMS provider credentials used by NewSMSProviderFromSettings.
type SMSConfig struct {
	Provider  string // "smsc" | "smsru" | "smsaero" | "twilio" | ""
	APIKey    string // login / account SID / API id depending on provider
	APISecret string // password / auth token depending on provider
	FromName  string // sender name / alphanumeric sender ID
}

// NewSMSProviderFromSettings builds the correct SMSProvider based on deployment settings.
// Returns a LogSMSProvider (no-op logger) when provider is empty or disabled.
func NewSMSProviderFromSettings(s *models.DeploymentSaaSSettings) SMSProvider {
	if s == nil || !s.SmsEnabled || s.SmsProvider == "" {
		return &LogSMSProvider{}
	}
	cfg := SMSConfig{
		Provider:  s.SmsProvider,
		APIKey:    s.SmsApiKey,
		APISecret: s.SmsApiSecret,
		FromName:  s.SmsFromName,
	}
	return NewSMSProviderFromConfig(cfg)
}

// NewSMSProviderFromConfig creates the correct provider from a config struct.
func NewSMSProviderFromConfig(cfg SMSConfig) SMSProvider {
	switch cfg.Provider {
	case "smsc":
		return NewSMSCProvider(cfg.APIKey, cfg.APISecret, cfg.FromName)
	case "smsru":
		return NewSMSRuProvider(cfg.APIKey, cfg.FromName)
	case "smsaero":
		return NewSMSAeroProvider(cfg.APIKey, cfg.APISecret, cfg.FromName)
	case "twilio":
		return NewTwilioSMSProvider(cfg.APIKey, cfg.APISecret, cfg.FromName)
	default:
		return &LogSMSProvider{}
	}
}
