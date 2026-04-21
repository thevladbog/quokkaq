package services

import (
	"os"
	"strings"

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
// Env vars SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET, SMS_FROM_NAME override DB values:
//   - SMS_API_KEY and SMS_API_SECRET always win (keep secrets out of DB in prod).
//   - SMS_PROVIDER and SMS_FROM_NAME are used only when the DB field is empty.
//   - If SMS_PROVIDER env is set, SMS is considered enabled even if SmsEnabled=false in DB.
func NewSMSProviderFromSettings(s *models.DeploymentSaaSSettings) SMSProvider {
	cfg := SMSConfig{}
	if s != nil {
		cfg.Provider = s.SmsProvider
		cfg.APIKey = s.SmsApiKey
		cfg.APISecret = s.SmsApiSecret
		cfg.FromName = s.SmsFromName
	}
	applySMSEnvOverrides(&cfg)

	// SMS_PROVIDER env override bypasses the SmsEnabled DB flag.
	// Without env override, SmsEnabled=false disables SMS even when a provider is configured in DB.
	envOverride := strings.TrimSpace(os.Getenv("SMS_PROVIDER")) != ""
	smsEnabled := envOverride || (s != nil && s.SmsEnabled)
	if !smsEnabled || cfg.Provider == "" {
		return &LogSMSProvider{}
	}
	return NewSMSProviderFromConfig(cfg)
}

// applySMSEnvOverrides merges environment variable overrides into cfg.
// API credentials from env always win; provider and sender name only fill empty DB fields.
func applySMSEnvOverrides(cfg *SMSConfig) {
	if v := strings.TrimSpace(os.Getenv("SMS_PROVIDER")); v != "" && cfg.Provider == "" {
		cfg.Provider = v
	}
	if v := os.Getenv("SMS_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("SMS_API_SECRET"); v != "" {
		cfg.APISecret = v
	}
	if v := strings.TrimSpace(os.Getenv("SMS_FROM_NAME")); v != "" && cfg.FromName == "" {
		cfg.FromName = v
	}
}

// MaskPhone replaces the middle digits of an E.164 number with asterisks, keeping the
// country code prefix (first 2 chars) and the last 4 digits, e.g. "+7***1234".
func MaskPhone(phone string) string {
	if len(phone) <= 6 {
		return "***"
	}
	return phone[:2] + "***" + phone[len(phone)-4:]
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
