package repository

import (
	"errors"

	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"

	"gorm.io/gorm"
)

type CompanyRepository interface {
	FindByID(id string) (*models.Company, error)
	FindByIDWithBilling(id string) (*models.Company, error)
	FindSaaSOperatorCompany() (*models.Company, error)
	ListPaginated(search string, limit, offset int) ([]models.Company, int64, error)
	Update(company *models.Company) error
}

type companyRepository struct{}

func NewCompanyRepository() CompanyRepository {
	return &companyRepository{}
}

func (r *companyRepository) FindByID(id string) (*models.Company, error) {
	var company models.Company
	err := database.DB.Where("id = ?", id).First(&company).Error
	if err != nil {
		return nil, err
	}
	return &company, nil
}

func (r *companyRepository) FindByIDWithBilling(id string) (*models.Company, error) {
	var company models.Company
	err := database.DB.
		Preload("Subscription.Plan").
		Preload("Subscription.PendingPlan").
		Preload("Units", func(db *gorm.DB) *gorm.DB { return db.Order("name ASC") }).
		Where("id = ?", id).
		First(&company).Error
	if err != nil {
		return nil, err
	}
	return &company, nil
}

func (r *companyRepository) FindSaaSOperatorCompany() (*models.Company, error) {
	var company models.Company
	err := database.DB.Where("is_saas_operator = ?", true).First(&company).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &company, nil
}

func (r *companyRepository) ListPaginated(search string, limit, offset int) ([]models.Company, int64, error) {
	q := database.DB.Model(&models.Company{})
	if search != "" {
		term := "%" + search + "%"
		q = q.Where("name ILIKE ?", term)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var companies []models.Company
	err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&companies).Error
	return companies, total, err
}

func (r *companyRepository) Update(company *models.Company) error {
	return database.DB.Save(company).Error
}
