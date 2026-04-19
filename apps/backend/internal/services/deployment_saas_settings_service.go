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
	if err := s.repo.Upsert(&merged); err != nil {
		return nil, err
	}
	return s.repo.Get()
}
