package services

import (
	"fmt"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/internal/repository"
)

// DeploymentSaaSSettingsService owns business logic for the singleton deployment integration settings row.
type DeploymentSaaSSettingsService struct {
	repo repository.DeploymentSaaSSettingsRepository
}

// NewDeploymentSaaSSettingsService constructs DeploymentSaaSSettingsService.
func NewDeploymentSaaSSettingsService(repo repository.DeploymentSaaSSettingsRepository) *DeploymentSaaSSettingsService {
	return &DeploymentSaaSSettingsService{repo: repo}
}

// GetIntegrationSettings returns the current deployment integration settings.
func (s *DeploymentSaaSSettingsService) GetIntegrationSettings() (*models.DeploymentSaaSSettings, error) {
	if s == nil || s.repo == nil {
		return nil, fmt.Errorf("deployment saas settings service: not configured")
	}
	return s.repo.Get()
}

// DeploymentSaaSSettingsPatch is a partial update payload (nil pointer = leave unchanged).
type DeploymentSaaSSettingsPatch struct {
	LeadsTrackerQueue       *string `json:"leadsTrackerQueue,omitempty"`
	TrackerTypeRegistration *string `json:"trackerTypeRegistration,omitempty"`
	TrackerTypeRequest      *string `json:"trackerTypeRequest,omitempty"`
	TrackerTypeError        *string `json:"trackerTypeError,omitempty"`
	SupportTrackerQueue     *string `json:"supportTrackerQueue,omitempty"`
	TrackerTypeSupport      *string `json:"trackerTypeSupport,omitempty"`
	// SMS provider settings (all optional).
	SmsProvider  *string `json:"smsProvider,omitempty"`
	SmsApiKey    *string `json:"smsApiKey,omitempty"`    // full credential (write-only; never returned in GET)
	SmsApiSecret *string `json:"smsApiSecret,omitempty"` // full credential (write-only; never returned in GET)
	SmsFromName  *string `json:"smsFromName,omitempty"`
	SmsEnabled   *bool   `json:"smsEnabled,omitempty"`
}

// PatchIntegrationSettings merges patch into stored settings, upserts, and returns the persisted row.
func (s *DeploymentSaaSSettingsService) PatchIntegrationSettings(patch *DeploymentSaaSSettingsPatch) (*models.DeploymentSaaSSettings, error) {
	if s == nil || s.repo == nil {
		return nil, fmt.Errorf("deployment saas settings service: not configured")
	}
	if patch == nil {
		patch = &DeploymentSaaSSettingsPatch{}
	}
	existing, err := s.repo.Get()
	if err != nil {
		return nil, err
	}
	merged := *existing
	if patch.LeadsTrackerQueue != nil {
		merged.LeadsTrackerQueue = *patch.LeadsTrackerQueue
	}
	if patch.TrackerTypeRegistration != nil {
		merged.TrackerTypeRegistration = *patch.TrackerTypeRegistration
	}
	if patch.TrackerTypeRequest != nil {
		merged.TrackerTypeRequest = *patch.TrackerTypeRequest
	}
	if patch.TrackerTypeError != nil {
		merged.TrackerTypeError = *patch.TrackerTypeError
	}
	if patch.SupportTrackerQueue != nil {
		merged.SupportTrackerQueue = *patch.SupportTrackerQueue
	}
	if patch.TrackerTypeSupport != nil {
		merged.TrackerTypeSupport = *patch.TrackerTypeSupport
	}
	if patch.SmsProvider != nil {
		merged.SmsProvider = *patch.SmsProvider
	}
	if patch.SmsApiKey != nil && *patch.SmsApiKey != "" {
		merged.SmsApiKey = *patch.SmsApiKey
	}
	if patch.SmsApiSecret != nil && *patch.SmsApiSecret != "" {
		merged.SmsApiSecret = *patch.SmsApiSecret
	}
	if patch.SmsFromName != nil {
		merged.SmsFromName = *patch.SmsFromName
	}
	if patch.SmsEnabled != nil {
		merged.SmsEnabled = *patch.SmsEnabled
	}
	if err := s.repo.Upsert(&merged); err != nil {
		return nil, err
	}
	return s.repo.Get()
}

// GetSMSProvider builds and returns the active SMSProvider based on persisted settings.
// Returns a log-only provider when SMS is disabled or not configured.
func (s *DeploymentSaaSSettingsService) GetSMSProvider() SMSProvider {
	if s == nil || s.repo == nil {
		return &LogSMSProvider{}
	}
	row, err := s.repo.Get()
	if err != nil {
		return &LogSMSProvider{}
	}
	return NewSMSProviderFromSettings(row)
}
