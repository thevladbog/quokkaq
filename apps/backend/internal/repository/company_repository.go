package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

type CompanyRepository interface {
	FindByID(id string) (*models.Company, error)
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

func (r *companyRepository) Update(company *models.Company) error {
	return database.DB.Save(company).Error
}
