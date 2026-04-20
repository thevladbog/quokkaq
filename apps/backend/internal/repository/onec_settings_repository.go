package repository

import (
	"errors"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrOneCSettingsNotFound is returned when no row exists for a company.
var ErrOneCSettingsNotFound = errors.New("onec settings not found")

type OneCSettingsRepository interface {
	GetByCompanyID(companyID string) (*models.CompanyOneCSettings, error)
	Upsert(settings *models.CompanyOneCSettings) error
	FindByHTTPLogin(login string) (*models.CompanyOneCSettings, error)
}

type oneCSettingsRepository struct{}

func NewOneCSettingsRepository() OneCSettingsRepository {
	return &oneCSettingsRepository{}
}

func (r *oneCSettingsRepository) GetByCompanyID(companyID string) (*models.CompanyOneCSettings, error) {
	var row models.CompanyOneCSettings
	err := database.DB.Where("company_id = ?", companyID).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrOneCSettingsNotFound
		}
		return nil, err
	}
	return &row, nil
}

func (r *oneCSettingsRepository) Upsert(settings *models.CompanyOneCSettings) error {
	if settings.CompanyID == "" {
		return errors.New("company id required")
	}
	row := *settings
	return database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "company_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"exchange_enabled",
			"http_login",
			"http_password_bcrypt",
			"commerce_ml_version",
			"status_mapping_json",
			"site_payment_system_name",
			"updated_at",
		}),
	}).Create(&row).Error
}

func (r *oneCSettingsRepository) FindByHTTPLogin(login string) (*models.CompanyOneCSettings, error) {
	var row models.CompanyOneCSettings
	err := database.DB.Where("http_login = ?", login).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrOneCSettingsNotFound
		}
		return nil, err
	}
	return &row, nil
}
