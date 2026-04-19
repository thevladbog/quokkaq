package repository

import (
	"errors"
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// DeploymentSaaSSettingsRepository persists singleton deployment integration settings.
type DeploymentSaaSSettingsRepository interface {
	Get() (*models.DeploymentSaaSSettings, error)
	Upsert(row *models.DeploymentSaaSSettings) error
}

type deploymentSaaSSettingsRepository struct{}

// NewDeploymentSaaSSettingsRepository constructs the repository.
func NewDeploymentSaaSSettingsRepository() DeploymentSaaSSettingsRepository {
	return &deploymentSaaSSettingsRepository{}
}

func (deploymentSaaSSettingsRepository) Get() (*models.DeploymentSaaSSettings, error) {
	var row models.DeploymentSaaSSettings
	err := database.DB.Where("id = ?", models.DeploymentSaaSSettingsSingletonID).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &models.DeploymentSaaSSettings{ID: models.DeploymentSaaSSettingsSingletonID}, nil
		}
		return nil, err
	}
	return &row, nil
}

func (deploymentSaaSSettingsRepository) Upsert(row *models.DeploymentSaaSSettings) error {
	if row == nil {
		return errors.New("deployment saas settings: nil row")
	}
	id := models.DeploymentSaaSSettingsSingletonID
	var existing models.DeploymentSaaSSettings
	err := database.DB.Where("id = ?", id).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row.ID = id
		return database.DB.Create(row).Error
	}
	if err != nil {
		return err
	}
	return database.DB.Model(&existing).Updates(map[string]interface{}{
		"leads_tracker_queue":       row.LeadsTrackerQueue,
		"tracker_type_registration": row.TrackerTypeRegistration,
		"tracker_type_request":      row.TrackerTypeRequest,
		"tracker_type_error":        row.TrackerTypeError,
		"support_tracker_queue":     row.SupportTrackerQueue,
		"tracker_type_support":      row.TrackerTypeSupport,
	}).Error
}
