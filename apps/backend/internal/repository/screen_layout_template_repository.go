package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

// ScreenLayoutTemplateRepository persists tenant screen layout templates.
type ScreenLayoutTemplateRepository interface {
	ListByCompany(companyID string) ([]models.ScreenLayoutTemplate, error)
	GetByIDAndCompany(id, companyID string) (*models.ScreenLayoutTemplate, error)
	Create(row *models.ScreenLayoutTemplate) error
	Update(row *models.ScreenLayoutTemplate) error
	Delete(id, companyID string) error
}

type screenLayoutTemplateRepository struct {
	db *gorm.DB
}

// NewScreenLayoutTemplateRepository constructs a GORM-backed repository.
func NewScreenLayoutTemplateRepository() ScreenLayoutTemplateRepository {
	return &screenLayoutTemplateRepository{db: database.DB}
}

func (r *screenLayoutTemplateRepository) ListByCompany(companyID string) ([]models.ScreenLayoutTemplate, error) {
	var out []models.ScreenLayoutTemplate
	err := r.db.Where("company_id = ?", companyID).Order("name ASC").Find(&out).Error
	return out, err
}

func (r *screenLayoutTemplateRepository) GetByIDAndCompany(id, companyID string) (*models.ScreenLayoutTemplate, error) {
	var row models.ScreenLayoutTemplate
	err := r.db.Where("id = ? AND company_id = ?", id, companyID).First(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *screenLayoutTemplateRepository) Create(row *models.ScreenLayoutTemplate) error {
	return r.db.Create(row).Error
}

func (r *screenLayoutTemplateRepository) Update(row *models.ScreenLayoutTemplate) error {
	res := r.db.Model(&models.ScreenLayoutTemplate{}).
		Where("id = ? AND company_id = ?", row.ID, row.CompanyID).
		Updates(map[string]interface{}{
			"name":       row.Name,
			"definition": row.Definition,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *screenLayoutTemplateRepository) Delete(id, companyID string) error {
	res := r.db.Where("id = ? AND company_id = ?", id, companyID).Delete(&models.ScreenLayoutTemplate{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
