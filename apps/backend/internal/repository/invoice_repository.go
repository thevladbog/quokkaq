package repository

import (
	"quokkaq-go-backend/internal/models"
	"quokkaq-go-backend/pkg/database"
)

type InvoiceRepository interface {
	Create(invoice *models.Invoice) error
	FindByID(id string) (*models.Invoice, error)
	FindByCompanyID(companyID string) ([]models.Invoice, error)
	Update(invoice *models.Invoice) error
	Delete(id string) error
}

type invoiceRepository struct{}

func NewInvoiceRepository() InvoiceRepository {
	return &invoiceRepository{}
}

func (r *invoiceRepository) Create(invoice *models.Invoice) error {
	return database.DB.Create(invoice).Error
}

func (r *invoiceRepository) FindByID(id string) (*models.Invoice, error) {
	var invoice models.Invoice
	err := database.DB.Where("id = ?", id).First(&invoice).Error
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

func (r *invoiceRepository) FindByCompanyID(companyID string) ([]models.Invoice, error) {
	var invoices []models.Invoice
	err := database.DB.Where("company_id = ?", companyID).
		Order("created_at DESC").
		Find(&invoices).Error
	return invoices, err
}

func (r *invoiceRepository) Update(invoice *models.Invoice) error {
	return database.DB.Save(invoice).Error
}

func (r *invoiceRepository) Delete(id string) error {
	return database.DB.Delete(&models.Invoice{}, "id = ?", id).Error
}
