package models

import "time"

// DeploymentSaaSSettings is a singleton row (id = "default") for SaaS-operator deployment integration settings.
type DeploymentSaaSSettings struct {
	ID                      string `gorm:"column:id;primaryKey" json:"id"`
	LeadsTrackerQueue       string `gorm:"column:leads_tracker_queue;not null;default:''" json:"leadsTrackerQueue"`
	TrackerTypeRegistration string `gorm:"column:tracker_type_registration;not null;default:''" json:"trackerTypeRegistration"`
	TrackerTypeRequest      string `gorm:"column:tracker_type_request;not null;default:''" json:"trackerTypeRequest"`
	TrackerTypeError        string `gorm:"column:tracker_type_error;not null;default:''" json:"trackerTypeError"`
	SupportTrackerQueue     string `gorm:"column:support_tracker_queue;not null;default:''" json:"supportTrackerQueue"`
	TrackerTypeSupport      string `gorm:"column:tracker_type_support;not null;default:''" json:"trackerTypeSupport"`
	// SMS notification provider fields (added in v1.6.2).
	// SmsProvider selects the SMS delivery backend: "smsc" | "smsru" | "smsaero" | "twilio" | "" (disabled).
	SmsProvider  string    `gorm:"column:sms_provider;not null;default:''" json:"smsProvider"`
	SmsApiKey    string    `gorm:"column:sms_api_key;not null;default:''" json:"-"` // never serialised to JSON (masked in response DTO)
	SmsApiSecret string    `gorm:"column:sms_api_secret;not null;default:''" json:"-"`
	SmsFromName  string    `gorm:"column:sms_from_name;not null;default:''" json:"smsFromName"`
	SmsEnabled   bool      `gorm:"column:sms_enabled;not null;default:false" json:"smsEnabled"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"column:updated_at" json:"updatedAt"`
}

func (DeploymentSaaSSettings) TableName() string {
	return "deployment_saas_settings"
}

const DeploymentSaaSSettingsSingletonID = "default"
