package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type TemplateRepository interface {
	Create(template *models.MessageTemplate) error
	// CreateWithDefaultPromotion runs clear-default + insert in one transaction so the tenant never loses the default row without a successful insert.
	CreateWithDefaultPromotion(companyID string, template *models.MessageTemplate) error
	FindAllByCompany(companyID string) ([]models.MessageTemplate, error)
	FindByID(id string) (*models.MessageTemplate, error)
	FindByIDAndCompany(id, companyID string) (*models.MessageTemplate, error)
	Update(template *models.MessageTemplate) error
	// UpdateWithDefaultPromotion runs clear-default + save in one transaction when promoting the default template.
	UpdateWithDefaultPromotion(companyID string, template *models.MessageTemplate) error
	Delete(id string) error
	FindDefaultByCompany(companyID string) (*models.MessageTemplate, error)
	// ClearDefaultFlagForCompany sets is_default = false for all templates in the company except exceptID (empty = all).
	ClearDefaultFlagForCompany(companyID string, exceptID string) error
}

type templateRepository struct {
	db *gorm.DB
}

func NewTemplateRepository() TemplateRepository {
	return &templateRepository{db: database.DB}
}

func (r *templateRepository) Create(template *models.MessageTemplate) error {
	return r.db.Create(template).Error
}

func (r *templateRepository) CreateWithDefaultPromotion(companyID string, template *models.MessageTemplate) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if template.IsDefault {
			if err := clearDefaultFlagForCompanyTx(tx, companyID, ""); err != nil {
				return err
			}
		}
		return tx.Create(template).Error
	})
}

func (r *templateRepository) UpdateWithDefaultPromotion(companyID string, template *models.MessageTemplate) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var existing models.MessageTemplate
		if err := tx.Where("id = ? AND company_id = ?", template.ID, companyID).First(&existing).Error; err != nil {
			return err
		}
		template.CompanyID = companyID
		if template.IsDefault {
			if err := clearDefaultFlagForCompanyTx(tx, companyID, template.ID); err != nil {
				return err
			}
		}
		return tx.Save(template).Error
	})
}

func clearDefaultFlagForCompanyTx(tx *gorm.DB, companyID string, exceptID string) error {
	q := tx.Model(&models.MessageTemplate{}).Where("company_id = ? AND is_default = ?", companyID, true)
	if exceptID != "" {
		q = q.Where("id <> ?", exceptID)
	}
	return q.Update("is_default", false).Error
}

func (r *templateRepository) FindAllByCompany(companyID string) ([]models.MessageTemplate, error) {
	var templates []models.MessageTemplate
	err := r.db.Where("company_id = ?", companyID).Order("name ASC").Find(&templates).Error
	return templates, err
}

func (r *templateRepository) FindByID(id string) (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	err := r.db.First(&template, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *templateRepository) FindByIDAndCompany(id, companyID string) (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	err := r.db.First(&template, "id = ? AND company_id = ?", id, companyID).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *templateRepository) Update(template *models.MessageTemplate) error {
	return r.db.Save(template).Error
}

func (r *templateRepository) Delete(id string) error {
	return r.db.Delete(&models.MessageTemplate{}, "id = ?", id).Error
}

func (r *templateRepository) FindDefaultByCompany(companyID string) (*models.MessageTemplate, error) {
	var template models.MessageTemplate
	err := r.db.Where("company_id = ? AND is_default = ?", companyID, true).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

func (r *templateRepository) ClearDefaultFlagForCompany(companyID string, exceptID string) error {
	return clearDefaultFlagForCompanyTx(r.db, companyID, exceptID)
}
