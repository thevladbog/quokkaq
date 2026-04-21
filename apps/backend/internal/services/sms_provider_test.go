package services

import (
	"testing"

	"quokkaq-go-backend/internal/models"
)

// --- NewSMSProviderFromConfig ---

func TestNewSMSProviderFromConfig_smsc(t *testing.T) {
	t.Parallel()
	p := NewSMSProviderFromConfig(SMSConfig{Provider: "smsc", APIKey: "login", APISecret: "pass"})
	if p.Name() != "smsc" {
		t.Errorf("want 'smsc', got %q", p.Name())
	}
}

func TestNewSMSProviderFromConfig_smsru(t *testing.T) {
	t.Parallel()
	p := NewSMSProviderFromConfig(SMSConfig{Provider: "smsru", APIKey: "api_id"})
	if p.Name() != "smsru" {
		t.Errorf("want 'smsru', got %q", p.Name())
	}
}

func TestNewSMSProviderFromConfig_smsaero(t *testing.T) {
	t.Parallel()
	p := NewSMSProviderFromConfig(SMSConfig{Provider: "smsaero", APIKey: "email", APISecret: "key"})
	if p.Name() != "smsaero" {
		t.Errorf("want 'smsaero', got %q", p.Name())
	}
}

func TestNewSMSProviderFromConfig_twilio(t *testing.T) {
	t.Parallel()
	p := NewSMSProviderFromConfig(SMSConfig{Provider: "twilio", APIKey: "SID", APISecret: "token", FromName: "+1234"})
	if p.Name() != "twilio" {
		t.Errorf("want 'twilio', got %q", p.Name())
	}
}

func TestNewSMSProviderFromConfig_unknownFallsToLog(t *testing.T) {
	t.Parallel()
	p := NewSMSProviderFromConfig(SMSConfig{Provider: "unknown_xyz"})
	if p.Name() != "log" {
		t.Errorf("unknown provider: want 'log', got %q", p.Name())
	}
}

func TestNewSMSProviderFromConfig_emptyFallsToLog(t *testing.T) {
	t.Parallel()
	p := NewSMSProviderFromConfig(SMSConfig{})
	if p.Name() != "log" {
		t.Errorf("empty config: want 'log', got %q", p.Name())
	}
}

// --- applySMSEnvOverrides ---

func TestApplySMSEnvOverrides_apiKeyAlwaysOverrides(t *testing.T) {
	t.Setenv("SMS_API_KEY", "env_key")
	t.Setenv("SMS_API_SECRET", "env_secret")
	cfg := SMSConfig{APIKey: "db_key", APISecret: "db_secret"}
	applySMSEnvOverrides(&cfg)
	if cfg.APIKey != "env_key" {
		t.Errorf("API key: want 'env_key', got %q", cfg.APIKey)
	}
	if cfg.APISecret != "env_secret" {
		t.Errorf("API secret: want 'env_secret', got %q", cfg.APISecret)
	}
}

func TestApplySMSEnvOverrides_providerFillsWhenEmpty(t *testing.T) {
	t.Setenv("SMS_PROVIDER", "smsc")
	cfg := SMSConfig{Provider: ""}
	applySMSEnvOverrides(&cfg)
	if cfg.Provider != "smsc" {
		t.Errorf("provider: want 'smsc', got %q", cfg.Provider)
	}
}

func TestApplySMSEnvOverrides_providerDoesNotOverrideExisting(t *testing.T) {
	t.Setenv("SMS_PROVIDER", "twilio")
	cfg := SMSConfig{Provider: "smsru"}
	applySMSEnvOverrides(&cfg)
	if cfg.Provider != "smsru" {
		t.Errorf("provider: should keep 'smsru' when already set, got %q", cfg.Provider)
	}
}

func TestApplySMSEnvOverrides_fromNameFillsWhenEmpty(t *testing.T) {
	t.Setenv("SMS_FROM_NAME", "QuokkaQ")
	cfg := SMSConfig{FromName: ""}
	applySMSEnvOverrides(&cfg)
	if cfg.FromName != "QuokkaQ" {
		t.Errorf("from name: want 'QuokkaQ', got %q", cfg.FromName)
	}
}

func TestApplySMSEnvOverrides_fromNameDoesNotOverrideExisting(t *testing.T) {
	t.Setenv("SMS_FROM_NAME", "Env")
	cfg := SMSConfig{FromName: "DB"}
	applySMSEnvOverrides(&cfg)
	if cfg.FromName != "DB" {
		t.Errorf("from name: should keep 'DB', got %q", cfg.FromName)
	}
}

func TestApplySMSEnvOverrides_noEnvLeavesConfigUnchanged(t *testing.T) {
	// Ensure no relevant env vars are set.
	t.Setenv("SMS_PROVIDER", "")
	t.Setenv("SMS_API_KEY", "")
	t.Setenv("SMS_API_SECRET", "")
	t.Setenv("SMS_FROM_NAME", "")
	cfg := SMSConfig{Provider: "smsru", APIKey: "mykey", APISecret: "mysecret", FromName: "Me"}
	applySMSEnvOverrides(&cfg)
	if cfg.Provider != "smsru" || cfg.APIKey != "mykey" || cfg.APISecret != "mysecret" || cfg.FromName != "Me" {
		t.Errorf("config should be unchanged without env vars, got %+v", cfg)
	}
}

// --- NewSMSProviderFromSettings ---

func TestNewSMSProviderFromSettings_nilSettingsReturnsLog(t *testing.T) {
	t.Setenv("SMS_PROVIDER", "")
	t.Setenv("SMS_API_KEY", "")
	p := NewSMSProviderFromSettings(nil)
	if p.Name() != "log" {
		t.Errorf("nil settings: want 'log', got %q", p.Name())
	}
}

func TestNewSMSProviderFromSettings_disabledButProviderSetStillActivates(t *testing.T) {
	// Per implementation: non-empty SmsProvider in DB activates SMS even when SmsEnabled=false.
	// SmsEnabled=false is only effective when SmsProvider is also empty.
	t.Setenv("SMS_PROVIDER", "")
	t.Setenv("SMS_API_KEY", "")
	t.Setenv("SMS_API_SECRET", "")
	settings := &models.DeploymentSaaSSettings{
		SmsEnabled:  false,
		SmsProvider: "smsru",
		SmsApiKey:   "key",
	}
	p := NewSMSProviderFromSettings(settings)
	if p.Name() != "smsru" {
		t.Errorf("non-empty provider in DB should activate SMS, got %q", p.Name())
	}
}

func TestNewSMSProviderFromSettings_disabledAndNoProviderReturnsLog(t *testing.T) {
	t.Setenv("SMS_PROVIDER", "")
	t.Setenv("SMS_API_KEY", "")
	settings := &models.DeploymentSaaSSettings{
		SmsEnabled:  false,
		SmsProvider: "",
	}
	p := NewSMSProviderFromSettings(settings)
	if p.Name() != "log" {
		t.Errorf("disabled + no provider: want 'log', got %q", p.Name())
	}
}

func TestNewSMSProviderFromSettings_enabledReturnsProvider(t *testing.T) {
	t.Setenv("SMS_PROVIDER", "")
	t.Setenv("SMS_API_KEY", "")
	t.Setenv("SMS_API_SECRET", "")
	settings := &models.DeploymentSaaSSettings{
		SmsEnabled:   true,
		SmsProvider:  "smsc",
		SmsApiKey:    "login",
		SmsApiSecret: "pass",
	}
	p := NewSMSProviderFromSettings(settings)
	if p.Name() != "smsc" {
		t.Errorf("SMS enabled: want 'smsc', got %q", p.Name())
	}
}

func TestNewSMSProviderFromSettings_envProviderActivatesEvenWhenDisabled(t *testing.T) {
	t.Setenv("SMS_PROVIDER", "smsaero")
	t.Setenv("SMS_API_KEY", "email@example.com")
	t.Setenv("SMS_API_SECRET", "api_key")
	settings := &models.DeploymentSaaSSettings{
		SmsEnabled: false,
	}
	p := NewSMSProviderFromSettings(settings)
	if p.Name() != "smsaero" {
		t.Errorf("env provider override: want 'smsaero', got %q", p.Name())
	}
}
