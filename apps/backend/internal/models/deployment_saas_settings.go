package models

import "time"

// DeploymentSaaSSettings is a singleton row (id = "default") for SaaS-operator deployment integration settings.
type DeploymentSaaSSettings struct {
	ID                      string    `gorm:"column:id;primaryKey" json:"id"`
	LeadsTrackerQueue       string    `gorm:"column:leads_tracker_queue;not null;default:''" json:"leadsTrackerQueue"`
	TrackerTypeRegistration string    `gorm:"column:tracker_type_registration;not null;default:''" json:"trackerTypeRegistration"`
	TrackerTypeRequest      string    `gorm:"column:tracker_type_request;not null;default:''" json:"trackerTypeRequest"`
	TrackerTypeError        string    `gorm:"column:tracker_type_error;not null;default:''" json:"trackerTypeError"`
	SupportTrackerQueue     string    `gorm:"column:support_tracker_queue;not null;default:''" json:"supportTrackerQueue"`
	TrackerTypeSupport      string    `gorm:"column:tracker_type_support;not null;default:''" json:"trackerTypeSupport"`
	CreatedAt               time.Time `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt               time.Time `gorm:"column:updated_at" json:"updatedAt"`
}

func (DeploymentSaaSSettings) TableName() string {
	return "deployment_saas_settings"
}

const DeploymentSaaSSettingsSingletonID = "default"
