package repository

import (
	"errors"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
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
	var count int64
	if err := database.DB.Model(&models.CompanyOneCSettings{}).Where("company_id = ?", settings.CompanyID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return database.DB.Create(settings).Error
	}
	return database.DB.Model(&models.CompanyOneCSettings{}).Where("company_id = ?", settings.CompanyID).Updates(map[string]interface{}{
		"exchange_enabled":         settings.ExchangeEnabled,
		"http_login":               settings.HTTPLogin,
		"http_password_bcrypt":     settings.HTTPPasswordBcrypt,
		"commerce_ml_version":      settings.CommerceMLVersion,
		"status_mapping_json":      settings.StatusMappingJSON,
		"site_payment_system_name": settings.SitePaymentSystemName,
		"updated_at":               settings.UpdatedAt,
	}).Error
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
