package repository

import (
	"errors"

	"quokkaq-go-backend/internal/models"

	"gorm.io/gorm"
)

// EmployeeIdpRepository persists unit-scoped external IdP settings and secrets.
type EmployeeIdpRepository struct {
	db *gorm.DB
}

func NewEmployeeIdpRepository(db *gorm.DB) *EmployeeIdpRepository {
	return &EmployeeIdpRepository{db: db}
}

func (r *EmployeeIdpRepository) GetSettingByUnitID(unitID string) (*models.UnitEmployeeIdpSetting, error) {
	var row models.UnitEmployeeIdpSetting
	err := r.db.Where("unit_id = ?", unitID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// SaveSetting creates or updates the one row per unit.
func (r *EmployeeIdpRepository) SaveSetting(row *models.UnitEmployeeIdpSetting) error {
	var ex models.UnitEmployeeIdpSetting
	err := r.db.Where("unit_id = ?", row.UnitID).First(&ex).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r.db.Create(row).Error
	}
	if err != nil {
		return err
	}
	row.ID = ex.ID
	return r.db.Save(row).Error
}

func (r *EmployeeIdpRepository) ListSecrets(unitID string) ([]models.UnitEmployeeIdpSecret, error) {
	var rows []models.UnitEmployeeIdpSecret
	err := r.db.Where("unit_id = ?", unitID).Order("name").Find(&rows).Error
	return rows, err
}

func (r *EmployeeIdpRepository) UpsertSecret(s *models.UnitEmployeeIdpSecret) error {
	var ex models.UnitEmployeeIdpSecret
	err := r.db.Where("unit_id = ? AND name = ?", s.UnitID, s.Name).First(&ex).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r.db.Create(s).Error
	}
	if err != nil {
		return err
	}
	return r.db.Model(&models.UnitEmployeeIdpSecret{}).Where("id = ?", ex.ID).Update("ciphertext", s.Ciphertext).Error
}

func (r *EmployeeIdpRepository) DeleteSecret(unitID, name string) error {
	return r.db.Delete(&models.UnitEmployeeIdpSecret{}, "unit_id = ? AND name = ?", unitID, name).Error
}
